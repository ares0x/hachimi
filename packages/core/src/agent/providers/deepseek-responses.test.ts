import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message, ToolDefinition } from "../../types/index.js";
import { DeepSeekResponsesProvider, SERVER_WEB_SEARCH_TOOL } from "./deepseek-responses.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function sseResponse(...events: unknown[]): Response {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(text, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

const baseMessages: Message[] = [
  { id: "m1", role: "system", content: "You are hachimi.", timestamp: 1 },
  { id: "m2", role: "user", content: "今日金价多少？", timestamp: 2 },
];

describe("DeepSeekResponsesProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("parses non-streaming responses: reasoning + web_search_call + final message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "resp_1",
        output: [
          {
            type: "reasoning",
            id: "rs_1",
            summary: [{ type: "summary_text", text: "用户询问实时金价" }],
          },
          {
            type: "web_search_call",
            id: "ws_1",
            call_id: "call_ws_1",
            status: "completed",
            search_recall: {
              search_query: "今日金价",
              search_results: [
                {
                  title: "Gold API",
                  url: "https://api.gold-api.com/price/XAU",
                  text: "XAU $4,273",
                },
              ],
            },
          },
          {
            type: "message",
            id: "msg_1",
            role: "assistant",
            phase: "final_answer",
            content: [{ type: "output_text", text: "当前金价约 $4,273/盎司。" }],
          },
        ],
        usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepSeekResponsesProvider({
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
      baseURL: "https://api.deepseek.com",
    });
    const toolStart = vi.fn();
    const toolEnd = vi.fn();

    const res = await provider.chat(baseMessages, [], {
      onServerToolStart: toolStart,
      onServerToolEnd: toolEnd,
    });

    expect(res.content).toBe("当前金价约 $4,273/盎司。");
    expect(res.reasoning_content).toContain("用户询问实时金价");
    expect(res.usage?.inputTokens).toBe(12);
    expect(toolStart).toHaveBeenCalledWith(
      SERVER_WEB_SEARCH_TOOL,
      { query: "今日金价" },
      "call_ws_1"
    );
    expect(toolEnd).toHaveBeenCalledWith(
      SERVER_WEB_SEARCH_TOOL,
      expect.stringContaining("今日金价"),
      expect.any(Number),
      true,
      "call_ws_1"
    );

    // Request targets /responses (no /v1) with web_search declared.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/responses");
    const body = JSON.parse(init.body);
    expect(body.tools).toEqual([{ type: "web_search" }]);
    expect(body.input[0].role).toBe("system");
  });

  it("returns function_call items for the agent loop to execute locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          output: [
            {
              type: "function_call",
              id: "fc_1",
              call_id: "call_calc",
              name: "calculator",
              arguments: '{"a":1,"b":2,"operator":"+"}',
              status: "completed",
            },
          ],
        })
      )
    );

    const provider = new DeepSeekResponsesProvider({ apiKey: "sk-test" });
    const res = await provider.chat(baseMessages, [
      { name: "calculator", description: "calc", parameters: { type: "object" } },
    ] as unknown as ToolDefinition[]);
    expect(res.tool_calls).toHaveLength(1);
    expect(res.tool_calls![0]).toMatchObject({
      id: "call_calc",
      name: "calculator",
      arguments: { a: 1, b: 2, operator: "+" },
    });
  });

  it("omits the server web_search tool for tool-less text calls (e.g. vision companion)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ output: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepSeekResponsesProvider({ apiKey: "sk-test" });
    await provider.chat(baseMessages);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual([]);
  });

  it("writes reasoning.effort into the Responses API body (P2-3)", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ output: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepSeekResponsesProvider({ apiKey: "sk-test" });
    await provider.chat(baseMessages, [], { reasoningEffort: "none" });
    let body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: "none" });

    await provider.chat(baseMessages, [], { reasoningEffort: "max" });
    body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.reasoning).toEqual({ effort: "max" });
  });

  it("suppresses the local web_search tool def in favor of the server tool", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ output: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepSeekResponsesProvider({ apiKey: "sk-test" });
    const tools = [
      { name: "web_search", description: "local search", parameters: { type: "object" } },
      { name: "calculator", description: "calc", parameters: { type: "object" } },
    ] as unknown as ToolDefinition[];
    await provider.chat(baseMessages, tools);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual([
      { type: "web_search" },
      {
        type: "function",
        name: "calculator",
        description: "calc",
        parameters: { type: "object" },
      },
    ]);
  });

  it("converts assistant tool_calls history into function_call/function_call_output items", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ output: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepSeekResponsesProvider({ apiKey: "sk-test" });
    const messages: Message[] = [
      ...baseMessages,
      {
        id: "m3",
        role: "assistant",
        content: "",
        timestamp: 3,
        tool_calls: [
          { id: "call_calc", name: "calculator", arguments: { a: 1, b: 2, operator: "+" } },
        ],
      },
      {
        id: "m4",
        role: "tool",
        content: "3",
        tool_call_id: "call_calc",
        name: "calculator",
        timestamp: 4,
      },
    ];
    await provider.chat(messages);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toContainEqual({
      type: "function_call",
      call_id: "call_calc",
      name: "calculator",
      arguments: '{"a":1,"b":2,"operator":"+"}',
    });
    expect(body.input).toContainEqual({
      type: "function_call_output",
      call_id: "call_calc",
      output: "3",
    });
  });

  it("streams SSE: text deltas, reasoning, server tool lifecycle and usage", async () => {
    const events = [
      { type: "response.created", response: { id: "resp_1" } },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "web_search_call", id: "ws_1", call_id: "call_ws_1", status: "in_progress" },
      },
      { type: "response.reasoning_text.delta", delta: "先查价格", output_index: 1 },
      { type: "response.output_text.delta", delta: "当前金价约 ", output_index: 2 },
      { type: "response.output_text.delta", delta: "$4,273/盎司。", output_index: 2 },
      {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          type: "web_search_call",
          id: "ws_1",
          call_id: "call_ws_1",
          status: "completed",
          search_recall: { search_query: "今日金价", search_results: [] },
        },
      },
      {
        type: "response.output_item.done",
        output_index: 2,
        item: {
          type: "message",
          id: "msg_1",
          role: "assistant",
          content: [{ type: "output_text", text: "当前金价约 $4,273/盎司。" }],
        },
      },
      {
        type: "response.completed",
        response: {
          id: "resp_1",
          status: "completed",
          usage: { input_tokens: 15, output_tokens: 9, total_tokens: 24 },
        },
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(...events)));

    const provider = new DeepSeekResponsesProvider({
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
    });
    const chunks: string[] = [];
    const toolStart = vi.fn();
    const toolEnd = vi.fn();
    const res = await provider.chatStream(baseMessages, [], (c) => chunks.push(c), {
      onServerToolStart: toolStart,
      onServerToolEnd: toolEnd,
    });

    expect(chunks.join("")).toBe("当前金价约 $4,273/盎司。");
    expect(res.content).toBe("当前金价约 $4,273/盎司。");
    expect(res.reasoning_content).toContain("先查价格");
    expect(res.usage?.outputTokens).toBe(9);
    expect(toolStart).toHaveBeenCalledWith(SERVER_WEB_SEARCH_TOOL, {}, "call_ws_1");
    expect(toolEnd).toHaveBeenCalledWith(
      SERVER_WEB_SEARCH_TOOL,
      expect.stringContaining("今日金价"),
      expect.any(Number),
      true,
      "call_ws_1"
    );
  });
});
