// packages/core/src/extensions/mcp-transports.ts

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
 */
export class LegacyStdioTransport implements IMcpTransport {
  public readonly version: McpProtocolVersion = "2024-11-05";
  private tools: Map<string, { def: McpToolDefinition; handler: (args: any) => Promise<string> }> =
    new Map();

  constructor(private config: McpServerConfig) {}

  registerTool(def: McpToolDefinition, handler: (args: any) => Promise<string>) {
    this.tools.set(def.name, { def, handler });
  }

  async listTools(): Promise<McpToolDefinition[]> {
    return Array.from(this.tools.values()).map((t) => t.def);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `[Legacy MCP Error] Tool '${name}' not found on server`;
    }
    return tool.handler(args);
  }
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
