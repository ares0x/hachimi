// packages/channels/acp/src/server.ts
// P1: ACP (Agent Client Protocol) stdio 服务器
//
// 在 stdin 上读取 JSON-RPC 2.0 请求，stdout 输出响应与通知，日志走 stderr。
// 复用 HarnessRuntime.execute — 不绕过任何策略 / PathJail / 事件流。
import { createInterface } from "node:readline";
import type { HarnessRuntime } from "@hachimi/core";
import { generateId } from "@hachimi/shared";
import type {
  AcpApprovalResolver,
  AcpInitializeResult,
  AcpNotification,
  AcpSessionInfo,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./protocol.js";

export interface AcpServerDeps {
  runtime: HarnessRuntime;
  /** 输出通道（默认 process.stdout.write） */
  write?: (line: string) => void;
  /** 通知回调（默认经 write 发送 session/update 通知） */
  notify?: (n: AcpNotification) => void;
  /** 审批解析器（默认内部等待 session/action/resolve） */
  approval?: AcpApprovalResolver;
  /** 日志（默认 stderr） */
  log?: (msg: string) => void;
  /** 单次执行超时（ms，默认 120s） */
  defaultTimeoutMs?: number;
}

const ACP_PROTOCOL_VERSION = 1;

export function createAcpServer(deps: AcpServerDeps) {
  const { runtime } = deps;
  const write = deps.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const notify = deps.notify ?? ((n: AcpNotification) => write(JSON.stringify(n)));
  const log = deps.log ?? ((msg: string) => process.stderr.write(`[acp] ${msg}\n`));
  const defaultTimeoutMs = deps.defaultTimeoutMs ?? 120_000;

  // 会话级 AbortController（session/abort）
  const abortControllers = new Map<string, AbortController>();
  // 审批请求解析
  const pendingApprovals = new Map<
    string,
    { resolve: (v: boolean) => void; timer: NodeJS.Timeout }
  >();

  const approval: AcpApprovalResolver = deps.approval ?? {
    wait: (actionId, timeoutMs) =>
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          pendingApprovals.delete(actionId);
          resolve(false);
        }, timeoutMs);
        pendingApprovals.set(actionId, { resolve, timer });
      }),
    cancel: (actionId) => {
      const entry = pendingApprovals.get(actionId);
      if (entry) {
        clearTimeout(entry.timer);
        entry.resolve(false);
        pendingApprovals.delete(actionId);
      }
    },
  };

  function send(n: JsonRpcResponse | JsonRpcNotification): void {
    write(JSON.stringify(n));
  }

  function sessionInfo(sessionId: string): AcpSessionInfo | null {
    const session = runtime.sessions.load(sessionId);
    if (!session) return null;
    return {
      sessionId: session.id,
      title: session.title,
      messageCount: session.messages.length,
      updatedAt: session.updatedAt,
    };
  }

  async function handleRequest(
    method: string,
    params: any = {}
  ): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
    switch (method) {
      case "initialize": {
        const result: AcpInitializeResult = {
          protocolVersion: ACP_PROTOCOL_VERSION,
          agentCapabilities: {
            supportsPromptCaching: false,
            supportsAbort: true,
            supportsLoad: true,
            supportsActionRequests: true,
            permissions: ["safe", "needs_confirm", "dangerous"],
            channels: ["acp"],
          },
        };
        return { result };
      }

      case "session/new": {
        const session = runtime.sessions.create(
          params.title ? String(params.title) : undefined,
          params.sessionId ? String(params.sessionId) : undefined
        );
        abortControllers.set(session.id, new AbortController());
        return { result: { sessionId: session.id, title: session.title } };
      }

      case "session/load": {
        const sid = String(params.sessionId ?? "");
        if (!sid) return { error: { code: -32602, message: "sessionId required" } };
        const info = sessionInfo(sid);
        if (!info) return { error: { code: -32004, message: `session not found: ${sid}` } };
        abortControllers.set(sid, new AbortController());
        return { result: info };
      }

      case "session/list": {
        const sessions = runtime.sessions
          .list()
          .map((s) => ({ sessionId: s.id, title: s.title, updatedAt: s.updatedAt }))
          .slice(0, 100);
        return { result: { sessions } };
      }

      case "session/prompt": {
        const sid = String(params.sessionId ?? "");
        const prompt = String(params.prompt ?? "");
        if (!sid || !prompt)
          return { error: { code: -32602, message: "sessionId and prompt required" } };
        if (!runtime.sessions.load(sid)) {
          return { error: { code: -32004, message: `session not found: ${sid}` } };
        }

        const controller = abortControllers.get(sid) ?? new AbortController();
        abortControllers.set(sid, controller);
        const actionIdBase = generateId("act_");

        const output = await runtime.execute({
          prompt,
          sessionId: sid,
          channel: "acp",
          trustLevel: params.trustLevel ?? "standard",
          signal: controller.signal,
          options: {
            onChunk: (chunk) => {
              notify({
                method: "session/update",
                params: { sessionId: sid, type: "message_delta", content: chunk },
              });
            },
            onToolStart: (toolName, args) => {
              notify({
                method: "session/update",
                params: {
                  sessionId: sid,
                  type: "tool_call",
                  toolName,
                  content: JSON.stringify(args).slice(0, 2000),
                },
              });
            },
            onToolEnd: (toolName, result, _durationMs, success) => {
              notify({
                method: "session/update",
                params: {
                  sessionId: sid,
                  type: "tool_result",
                  toolName,
                  isError: !success,
                  content: result.slice(0, 2000),
                },
              });
            },
            onToolApproval: async (toolName, args, permission) => {
              const actionId = `${actionIdBase}_${toolName}`;
              notify({
                method: "session/action/request",
                params: {
                  actionId,
                  sessionId: sid,
                  toolName,
                  args,
                  permission: permission ?? "safe",
                },
              });
              return approval.wait(actionId, 120_000);
            },
          },
        });

        notify({
          method: "session/update",
          params: {
            sessionId: sid,
            type: "message_complete",
            content: output.content,
            isError: output.isError,
          },
        });
        return { result: { sessionId: sid, isError: output.isError, content: output.content } };
      }

      case "session/action/resolve": {
        const actionId = String(params.actionId ?? "");
        const approved = params.approved === true;
        if (actionId) approval.cancel(actionId);
        // 重新以指定结果解析
        const entry = pendingApprovals.get(actionId);
        if (entry) {
          clearTimeout(entry.timer);
          entry.resolve(approved);
          pendingApprovals.delete(actionId);
        }
        return { result: { actionId, approved } };
      }

      case "session/abort": {
        const controller = abortControllers.get(String(params.sessionId ?? ""));
        controller?.abort();
        return { result: { ok: true } };
      }

      case "session/getMessages": {
        const session = runtime.sessions.load(String(params.sessionId ?? ""));
        if (!session) return { error: { code: -32004, message: "session not found" } };
        const limit = Number(params.limit ?? 100);
        return { result: { messages: session.messages.slice(-limit) } };
      }

      case "session/close": {
        abortControllers.delete(String(params.sessionId ?? ""));
        return { result: { ok: true } };
      }

      case "session/delete": {
        const sid = String(params.sessionId ?? "");
        if (!runtime.sessions.load(sid))
          return { error: { code: -32004, message: "session not found" } };
        abortControllers.delete(sid);
        await runtime.sessions.delete(sid);
        await runtime.events.delete(sid);
        return { result: { ok: true } };
      }

      case "shutdown":
        return { result: { ok: true } };

      default:
        return { error: { code: -32601, message: `method not found: ${method}` } };
    }
  }

  /** 处理一行 JSON-RPC 请求（供 stdio 循环与测试复用） */
  async function dispatch(line: string): Promise<void> {
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
    } catch {
      send({
        jsonrpc: "2.0",
        id: null as unknown as string,
        error: { code: -32700, message: "parse error" },
      });
      return;
    }
    if (typeof req.id !== "string" && typeof req.id !== "number") return; // notification
    const { result, error } = await handleRequest(req.method, req.params);
    send({ jsonrpc: "2.0", id: req.id, ...(error ? { error } : { result }) });
  }

  function start(): void {
    const rl = createInterface({ input: process.stdin, terminal: false });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      dispatch(line.trim()).catch((err) => {
        log(`dispatch error: ${String(err?.message ?? err)}`);
      });
    });
    rl.on("close", () => process.exit(0));
  }

  return { dispatch, handleRequest, start, pendingApprovals };
}

/** CLI 入口：hachimi-acp */
export async function main(): Promise<void> {
  const { getOrCreateHarnessRuntime } = await import("@hachimi/core");
  const runtime = getOrCreateHarnessRuntime();
  const server = createAcpServer({ runtime });
  server.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
