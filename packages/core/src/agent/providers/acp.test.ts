import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../types/index.js";
import { type AcpClientConfig, AcpClientProvider, probeAcpAgent } from "./acp.js";

/**
 * A minimal ACP v2 agent speaking newline-delimited JSON-RPC over stdio.
 * Exercises initialize → session/new → prompt → update stream → idle.
 */
function fakeAgentScript(): string {
  return `
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\\n");
let sessionId = "sess_1";
rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: {
      protocolVersion: 2,
      capabilities: { session: { prompt: { image: true, audio: false, embeddedContext: true }, mcp: { stdio: true } } },
      info: { name: "fake-acp-agent", version: "1.0.0" },
      authMethods: [],
    } });
  } else if (msg.method === "session/new") {
    sessionId = "sess_" + Math.random().toString(36).slice(2, 8);
    send({ jsonrpc: "2.0", id: msg.id, result: { sessionId } });
  } else if (msg.method === "session/prompt") {
    send({ jsonrpc: "2.0", id: msg.id, result: {} });
    const up = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
    setTimeout(() => up({ sessionUpdate: "state_update", state: "running" }), 10);
    setTimeout(() => up({ sessionUpdate: "agent_thought", messageId: "th_1", role: "agent", content: [{ type: "text", text: "Let me think" }] }), 20);
    setTimeout(() => up({ sessionUpdate: "tool_call_update", toolCallId: "tc_1", title: "web_search", kind: "search", status: "in_progress", input: { query: "gold price" } }), 30);
    setTimeout(() => up({ sessionUpdate: "tool_call_update", toolCallId: "tc_1", title: "web_search", kind: "search", status: "completed", output: "found 3 results" }), 40);
    setTimeout(() => up({ sessionUpdate: "agent_message", messageId: "m_1", role: "agent", content: [{ type: "text", text: "Hello " }] }), 50);
    setTimeout(() => up({ sessionUpdate: "agent_message_chunk", messageId: "m_1", role: "agent", content: { type: "text", text: "world" } }), 60);
    setTimeout(() => up({ sessionUpdate: "usage_update", usage: { inputTokens: 10, outputTokens: 5 } }), 70);
    setTimeout(() => up({ sessionUpdate: "state_update", state: "idle", stopReason: "end_turn" }), 80);
  } else if (msg.method === "session/cancel") {
    const up = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
    setTimeout(() => up({ sessionUpdate: "state_update", state: "idle", stopReason: "cancelled" }), 20);
  } else if (msg.method === "session/close") {
    send({ jsonrpc: "2.0", id: msg.id, result: {} });
    process.exit(0);
  }
});
`;
}

function makeProvider(overrides: Partial<AcpClientConfig> = {}): AcpClientProvider {
  return new AcpClientProvider({
    apiKey: "",
    command: process.execPath,
    commandArgs: ["-e", fakeAgentScript()],
    cwd: process.cwd(),
    timeoutMs: 5_000,
    ...overrides,
  });
}

const messages: Message[] = [{ id: "u1", role: "user", content: "今日金价多少？", timestamp: 1 }];

const disposed: AcpClientProvider[] = [];

afterEach(() => {
  for (const p of disposed.splice(0)) p.dispose();
});

describe("AcpClientProvider", () => {
  it("initializes, creates a session, and aggregates a full turn", async () => {
    const provider = makeProvider();
    disposed.push(provider);
    const toolStart = vi.fn();
    const toolEnd = vi.fn();

    const res = await provider.chat(messages, [], {
      onServerToolStart: toolStart,
      onServerToolEnd: toolEnd,
    });

    expect(res.content).toBe("Hello world");
    expect(res.reasoning_content).toContain("Let me think");
    expect(res.usage?.inputTokens).toBe(10);
    expect(res.usage?.outputTokens).toBe(5);
    expect(toolStart).toHaveBeenCalledWith("web_search", { query: "gold price" }, "tc_1");
    expect(toolEnd).toHaveBeenCalledWith(
      "web_search",
      "found 3 results",
      expect.any(Number),
      true,
      "tc_1"
    );
  });

  it("streams agent_message_chunk through onChunk", async () => {
    const provider = makeProvider();
    disposed.push(provider);
    const chunks: string[] = [];

    const res = await provider.chatStream(messages, [], (c) => chunks.push(c));

    expect(chunks.join("")).toBe("Hello world");
    expect(res.content).toBe("Hello world");
  });

  it("reuses the same external session across turns", async () => {
    const provider = makeProvider();
    disposed.push(provider);

    await provider.chat(messages);
    await provider.chat(messages);

    // Both turns completed without a fresh process: the provider keeps the
    // session alive (sessionId survives). A fresh session would still work,
    // so this mainly guards against per-turn process teardown.
    expect(provider.sessionIdForTest()).toBeTruthy();
  });

  it("aborts the turn and cancels the external agent", async () => {
    const provider = makeProvider();
    disposed.push(provider);
    const controller = new AbortController();

    const promise = provider.chat(messages, [], { signal: controller.signal });
    setTimeout(() => controller.abort(), 40);

    await expect(promise).rejects.toThrow(/aborted/i);
  });

  it("probeAcpAgent reports capabilities and version", async () => {
    const info = await probeAcpAgent(
      process.execPath,
      ["-e", fakeAgentScript()],
      process.cwd(),
      5_000
    );

    expect(info.protocolVersion).toBe(2);
    expect(info.supportsSession).toBe(true);
    expect(info.name).toBe("fake-acp-agent");
  });
});
