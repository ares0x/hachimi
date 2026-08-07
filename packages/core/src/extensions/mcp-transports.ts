// packages/core/src/extensions/mcp-transports.ts

import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { ToolSandbox } from "../sandbox/sandbox.js";
import type {
  IMcpTransport,
  McpDiscoverResult,
  McpMeta,
  McpProtocolVersion,
  McpServerConfig,
  McpToolDefinition,
} from "./mcp-types.js";

/**
 * 2024-11-05 旧版 MCP 传输层实现 (Subprocess Stdio / Mock Handler)
 * - command === "mock"：保持旧的 Mock Handler 注册表语义（测试/内置工具使用）
 * - 其它 command：真实拉起子进程并走 JSON-RPC over stdio（initialize → tools/list → tools/call）
 */
export class LegacyStdioTransport implements IMcpTransport {
  public readonly version: McpProtocolVersion = "2024-11-05";
  private tools: Map<string, { def: McpToolDefinition; handler: (args: any) => Promise<string> }> =
    new Map();
  private child: ChildProcess | null = null;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private initPromise: Promise<void> | null = null;
  private closed = false;
  private stdoutLines: import("node:readline").Interface | null = null;

  constructor(private config: McpServerConfig) {}

  /**
   * 真实 Stdio 模式：拉起子进程并完成 initialize 握手（惰性、幂等）。
   * Mock 模式直接返回。
   */
  private async ensureInitialized(): Promise<void> {
    if (this.config.command === "mock") return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initializeStdio();
    try {
      await this.initPromise;
    } catch (err) {
      this.initPromise = null;
      throw err;
    }
  }

  private initializeStdio(): Promise<void> {
    const { command, args = [], env } = this.config;
    if (!command) {
      return Promise.reject(new Error(`MCP stdio server missing command: ${this.config.id || ""}`));
    }

    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        env: { ...ToolSandbox.scrubEnv(process.env), ...env },
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
      this.child = child;

      const rl = createInterface({ input: child.stdout });
      this.stdoutLines = rl;

      const onLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let msg: any;
        try {
          msg = JSON.parse(trimmed);
        } catch {
          return; // 忽略非 JSON 行
        }

        // JSON-RPC 响应
        if (msg && typeof msg.id === "number" && this.pending.has(msg.id)) {
          const entry = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            entry.reject(new Error(msg.error.message || "MCP RPC error"));
          } else {
            entry.resolve(msg.result);
          }
        }
      };

      rl.on("line", onLine);

      const onExit = () => {
        this.closed = true;
        const err = new Error(
          `MCP stdio server '${this.config.name || command}' exited unexpectedly`
        );
        for (const [, entry] of this.pending) {
          entry.reject(err);
        }
        this.pending.clear();
      };

      child.on("exit", onExit);
      child.on("error", (err) => {
        this.closed = true;
        for (const [, entry] of this.pending) {
          entry.reject(err);
        }
        this.pending.clear();
        reject(err);
      });

      // 1) initialize
      this.rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "hachimi", version: "0.1.0" },
      })
        .then(() => {
          // 2) notifications/initialized
          this.sendNotification("notifications/initialized", {});
          resolve();
        })
        .catch(reject);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.child?.stdin?.writable) return;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`, "utf-8");
  }

  private rpc(method: string, params: unknown, timeoutMs = 15000): Promise<any> {
    if (!this.child?.stdin?.writable) {
      return Promise.reject(new Error(`MCP stdio server not running for method ${method}`));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP RPC '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.child!.stdin!.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
        "utf-8"
      );
    });
  }

  async close(): Promise<void> {
    if (this.config.command === "mock" || this.closed) return;
    this.closed = true;
    try {
      this.child?.stdin?.end();
    } catch {
      /* ignore */
    }
    this.stdoutLines?.close();
    this.child?.kill();
  }

  registerTool(def: McpToolDefinition, handler: (args: any) => Promise<string>) {
    this.tools.set(def.name, { def, handler });
  }

  async listTools(): Promise<McpToolDefinition[]> {
    if (this.config.command !== "mock") {
      await this.ensureInitialized();
      try {
        const result = await this.rpc("tools/list", {});
        return Array.isArray(result?.tools) ? result.tools : [];
      } catch (err: unknown) {
        return Promise.reject(
          new Error(
            `MCP stdio tools/list failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    }
    return Array.from(this.tools.values()).map((t) => t.def);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (this.config.command !== "mock") {
      await this.ensureInitialized();
      try {
        const result = await this.rpc("tools/call", { name, arguments: args });
        if (result?.isError) {
          const text = extractMcpResultText(result);
          return `[MCP Error] ${text}`;
        }
        return extractMcpResultText(result) || `[MCP] Tool '${name}' returned no content`;
      } catch (err: unknown) {
        return `[MCP Stdio Error] ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    const tool = this.tools.get(name);
    if (!tool) {
      return `[Legacy MCP Error] Tool '${name}' not found on server`;
    }
    return tool.handler(args);
  }
}

function extractMcpResultText(result: any): string {
  if (typeof result?.content === "string") return result.content;
  if (Array.isArray(result?.content)) {
    return result.content
      .map((c: any) => (c?.type === "text" ? c.text : (c?.text ?? JSON.stringify(c))))
      .join("\n");
  }
  return result ? JSON.stringify(result) : "";
}

/**
 * 2026-07-28 最新版 MCP 无状态 HTTP/MRTR 传输层实现
 */
export class StatelessHttpTransport implements IMcpTransport {
  public readonly version: McpProtocolVersion = "2026-07-28";
  private serverUrl: string;

  constructor(
    private config: McpServerConfig,
    private customFetch: typeof fetch = globalThis.fetch
  ) {
    this.serverUrl = config.url || "http://localhost:3000/mcp";
  }

  /**
   * 2026-07-28: `server/discover` 协议版本与 Capability 发现 RPC
   */
  async discover(): Promise<McpDiscoverResult> {
    try {
      const res = await this.customFetch(`${this.serverUrl}/discover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Mcp-Method": "server/discover",
        },
        body: JSON.stringify({
          _meta: this.buildMeta(),
        }),
      });
      if (!res.ok) {
        return { protocolVersion: "2026-07-28", supportedVersions: ["2026-07-28"] };
      }
      return (await res.json()) as McpDiscoverResult;
    } catch {
      return { protocolVersion: "2026-07-28", supportedVersions: ["2026-07-28"] };
    }
  }

  async listTools(): Promise<McpToolDefinition[]> {
    try {
      const res = await this.customFetch(`${this.serverUrl}/tools/list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Mcp-Method": "tools/list",
        },
        body: JSON.stringify({
          _meta: this.buildMeta(),
        }),
      });

      if (!res.ok) return [];
      const data = (await res.json()) as { tools?: McpToolDefinition[] };
      return data.tools || [];
    } catch {
      return [];
    }
  }

  /**
   * 2026-07-28: 支持 MRTR (Multi Round-Trip Requests) 的无状态 Tool 调用
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      const res = await this.customFetch(`${this.serverUrl}/tools/call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Mcp-Method": "tools/call",
        },
        body: JSON.stringify({
          _meta: this.buildMeta(),
          name,
          arguments: args,
        }),
      });

      if (!res.ok) {
        return `[MCP 2026-07-28 HTTP Error] Status ${res.status}`;
      }

      const body = (await res.json()) as any;
      if (body.resultType === "input_required") {
        return `[MCP 2026-07-28 MRTR] Input required for key '${body.requiredInputKey || "param"}': ${body.promptMessage || "Additional parameters needed."}`;
      }

      return typeof body.content === "string" ? body.content : JSON.stringify(body.content ?? body);
    } catch (err: any) {
      return `[MCP 2026-07-28 Transport Exception] ${err?.message || String(err)}`;
    }
  }

  private buildMeta(): McpMeta {
    return {
      protocolVersion: "2026-07-28",
      clientCapabilities: {
        stateless: true,
        mrtr: true,
      },
    };
  }
}
