// packages/channels/acp/src/server.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHarnessRuntime } from "@hachimi/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonRpcNotification, JsonRpcResponse } from "./protocol.js";
import { createAcpServer } from "./server.js";

let tmpDir: string;

function makeServer() {
  tmpDir = mkdtempSync(join(tmpdir(), "hachimi-acp-"));
  const runtime = createHarnessRuntime({
    providerOverride: "mock",
    configOverride: {
      paths: {
        dataDir: tmpDir,
        sessionsDir: join(tmpDir, "sessions"),
        memoryFile: join(tmpDir, "memory.json"),
      },
    } as never,
  });
  const lines: string[] = [];
  const server = createAcpServer({
    runtime,
    write: (l) => lines.push(l),
    notify: (n) => lines.push(JSON.stringify(n)),
    log: () => {},
  });
  return { runtime, server, lines };
}

function parseResponses<T = unknown>(lines: string[]): T[] {
  return lines.map((l) => JSON.parse(l) as T);
}

describe("ACP stdio server (P1)", () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "hachimi-acp-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("initialize returns protocol version and capabilities", async () => {
    const { server, lines } = makeServer();
    await server.dispatch(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: 1 },
      })
    );
    const [res] = parseResponses<JsonRpcResponse>(lines);
    expect(res.id).toBe(1);
    expect(res.result).toMatchObject({ protocolVersion: 1 });
    expect((res.result as any).agentCapabilities.supportsAbort).toBe(true);
  });

  it("session/new then session/prompt runs a turn and emits notifications", async () => {
    const { server, lines } = makeServer();
    await server.dispatch(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "session/new",
        params: { title: "ACP 会话" },
      })
    );
    const [newRes] = parseResponses<JsonRpcResponse>(lines);
    const sessionId = (newRes.result as any).sessionId;
    expect(sessionId).toBeTruthy();

    lines.length = 0;
    await server.dispatch(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "session/prompt",
        params: { sessionId, prompt: "你好" },
      })
    );
    const responses = parseResponses<JsonRpcResponse>(lines);
    const promptRes = responses.find((r) => r.id === 2);
    expect(promptRes?.result).toMatchObject({ sessionId });
    expect((promptRes?.result as { content?: unknown } | undefined)?.content).toBeTruthy();

    // 应发出 message_delta / message_complete 通知
    const notifications = parseResponses<JsonRpcNotification>(lines);
    expect(notifications.some((n) => n.method === "session/update")).toBe(true);
  });

  it("session/prompt with tool approval emits action/request and resolve approves", async () => {
    const { server, lines } = makeServer();
    await server.dispatch(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/new" }));
    const [newRes] = parseResponses<JsonRpcResponse>(lines);
    const sessionId = (newRes.result as any).sessionId;
    lines.length = 0;

    // 触发 run_command（needs_confirm + acp trustLevel=standard → 需审批）
    const promptPromise = server.dispatch(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "session/prompt",
        params: { sessionId, prompt: "调用工具 run_command" },
      })
    );

    // 等待 action/request 通知
    let actionId: string | undefined;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !actionId) {
      const reqs = parseResponses<JsonRpcNotification>(lines).filter(
        (n) => n.method === "session/action/request"
      );
      if (reqs.length > 0) actionId = (reqs[0].params as any).actionId;
      if (!actionId) await new Promise((r) => setTimeout(r, 50));
    }
    expect(actionId).toBeTruthy();

    await server.dispatch(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "session/action/resolve",
        params: { actionId, approved: true },
      })
    );
    await promptPromise;

    const responses = parseResponses<JsonRpcResponse>(lines);
    const promptRes = responses.find((r) => r.id === 2);
    expect(promptRes?.result).toBeTruthy();
  });

  it("unknown method returns error, session/delete works", async () => {
    const { server, lines } = makeServer();
    await server.dispatch(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "nope" }));
    let res = parseResponses<JsonRpcResponse>(lines)[0];
    expect(res.error?.code).toBe(-32601);

    lines.length = 0;
    await server.dispatch(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "session/new" }));
    const [newRes] = parseResponses<JsonRpcResponse>(lines);
    const sessionId = (newRes.result as any).sessionId;

    lines.length = 0;
    await server.dispatch(
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "session/delete", params: { sessionId } })
    );
    res = parseResponses<JsonRpcResponse>(lines)[0];
    expect(res.result).toEqual({ ok: true });
  });
});
