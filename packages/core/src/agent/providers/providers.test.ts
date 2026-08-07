import { describe, expect, it, vi } from "vitest";
import { AnthropicProviderTransport, dataUrlToAnthropicImage } from "./anthropic.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { ProviderRegistry } from "./transport.js";

describe("ProviderRegistry and ProviderTransports", () => {
  it("creates OpenAICompatibleProvider for openai, deepseek, moonshot, qwen", () => {
    const p1 = ProviderRegistry.create("deepseek", { apiKey: "test-key" });
    expect(p1).toBeInstanceOf(OpenAICompatibleProvider);

    const p2 = ProviderRegistry.create("moonshot", { apiKey: "test-key" });
    expect(p2).toBeInstanceOf(OpenAICompatibleProvider);

    const p3 = ProviderRegistry.create("qwen", { apiKey: "test-key" });
    expect(p3).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("creates AnthropicProviderTransport for anthropic / claude", () => {
    const p1 = ProviderRegistry.create("anthropic", { apiKey: "test-key" });
    expect(p1).toBeInstanceOf(AnthropicProviderTransport);

    const p2 = ProviderRegistry.create("claude", { apiKey: "test-key" });
    expect(p2).toBeInstanceOf(AnthropicProviderTransport);
  });

  it("converts image_url data URLs into Anthropic base64 image blocks", () => {
    const block = dataUrlToAnthropicImage("data:image/png;base64,AAAA");
    expect(block).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAAA" },
    });

    const jpeg = dataUrlToAnthropicImage("data:image/jpeg;base64,BBBB");
    expect(jpeg?.source.media_type).toBe("image/jpeg");
    expect(jpeg?.source.data).toBe("BBBB");

    // Non-data URLs are handled by the async fetch path; pure helper returns null.
    expect(dataUrlToAnthropicImage("https://example.com/a.png")).toBeNull();
  });

  it("writes reasoning effort into OpenAI-compatible request bodies (P2-3)", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init: { body: string }) => {
      const body = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "ok" } }] }),
        ...body,
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
    });
    const msg = { id: "m1", role: "user" as const, content: "hi", timestamp: 1 };

    // "none" → thinking.type=disabled（与 reasoning_effort 互斥，不同时发）
    await provider.chat([msg], [], { reasoningEffort: "none" });
    let sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.thinking).toEqual({ type: "disabled" });
    expect(sent.reasoning_effort).toBeUndefined();

    // low/medium/high → reasoning_effort 透传
    await provider.chat([msg], [], { reasoningEffort: "high" });
    sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent.reasoning_effort).toBe("high");
    expect(sent.thinking).toBeUndefined();

    // 流式同样生效
    const streamBody = JSON.stringify({ choices: [{ delta: { content: "ok" } }] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(`data: ${streamBody}\n\ndata: [DONE]\n\n`, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        })
      )
    );
    await provider.chatStream([msg], [], { reasoningEffort: "none" });
    const streamCalls = vi.mocked(fetch).mock.calls;
    const streamInit = streamCalls[0][1] as { body: string };
    sent = JSON.parse(streamInit.body);
    expect(sent.thinking).toEqual({ type: "disabled" });
  });
});
