// packages/core/src/extensions/mcp-client.ts
import type { ToolDefinition } from "../types/index.js";
import type { CapabilitySource } from "./capability.js";
import { LegacyStdioTransport, StatelessHttpTransport } from "./mcp-transports.js";
import type {
  IMcpTransport,
  McpProtocolVersion,
  McpServerConfig,
  McpToolDefinition,
} from "./mcp-types.js";

export type { McpProtocolVersion, McpServerConfig, McpToolDefinition } from "./mcp-types.js";
export { LegacyStdioTransport, StatelessHttpTransport } from "./mcp-transports.js";

/**
 * E4: Model Context Protocol (MCP) 客户端管理器
 * 支撑 MCP 2024-11-05 (Stdio/SSE) 与 2026-07-28 (Stateless HTTP/MRTR) 双版本无缝适配
 */
export class McpClientManager implements CapabilitySource<ToolDefinition> {
  public id = "mcp-client-source";
  public type = "mcp" as const;

  private servers: Map<string, McpServerConfig> = new Map();
  private transports: Map<string, IMcpTransport> = new Map();
  private mcpTools: Map<string, ToolDefinition> = new Map();

  constructor(configs: Record<string, McpServerConfig> = {}) {
    for (const [name, config] of Object.entries(configs)) {
      this.registerServer(name, config);
    }
  }

  /**
   * 注册 MCP Server，自动做 2024-11-05 / 2026-07-28 版本协商与 Transport 路由
   */
  registerServer(name: string, config: McpServerConfig): IMcpTransport {
    this.servers.set(name, config);

    // 2026-07-28: 若配置了 url 或显式声明 2026-07-28 协议，实例化无状态 HTTP 传输层
    let transport: IMcpTransport;
    if (config.url || config.protocolVersion === "2026-07-28") {
      transport = new StatelessHttpTransport(config);
    } else {
      transport = new LegacyStdioTransport(config);
    }

    this.transports.set(name, transport);
    return transport;
  }

  /**
   * 获取指定服务器的传输层实例
   */
  getTransport(serverName: string): IMcpTransport | undefined {
    return this.transports.get(serverName);
  }

  /**
   * 注册 Mock / 本地 / 直接注入的 MCP 工具（包含 2024-11-05 Stdio 兼容逻辑）
   */
  registerMcpTool(
    serverName: string,
    tool: McpToolDefinition,
    handler: (args: any) => Promise<string>
  ): ToolDefinition {
    let transport = this.transports.get(serverName);
    if (!transport || !(transport instanceof LegacyStdioTransport)) {
      const legacy = new LegacyStdioTransport({ command: "mock" });
      this.transports.set(serverName, legacy);
      transport = legacy;
    }

    if (transport instanceof LegacyStdioTransport) {
      transport.registerTool(tool, handler);
    }

    const qualifiedName = `mcp_${serverName}_${tool.name}`;
    const toolDef: ToolDefinition = {
      name: qualifiedName,
      description: tool.description || `MCP [${serverName}] 工具: ${tool.name}`,
      permission: "safe",
      parameters: tool.inputSchema || { type: "object", properties: {} },
      execute: async (args) => transport!.callTool(tool.name, args),
    };

    this.mcpTools.set(qualifiedName, toolDef);
    return toolDef;
  }

  async list(): Promise<ToolDefinition[]> {
    return Array.from(this.mcpTools.values());
  }

  async resolve(name: string): Promise<ToolDefinition | undefined> {
    return this.mcpTools.get(name);
  }

  listServers(): Array<{
    id: string;
    name: string;
    command?: string;
    args?: string[];
    enabled: boolean;
    status: "connected" | "disabled";
  }> {
    const result = [];
    for (const [id, config] of this.servers.entries()) {
      result.push({
        id,
        name: id,
        command: config.command,
        args: config.args,
        enabled: true,
        status: "connected" as const,
      });
    }
    return result;
  }

  async addServer(config: {
    id: string;
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    enabled?: boolean;
  }): Promise<void> {
    this.registerServer(config.id, {
      command: config.command,
      args: config.args,
      env: config.env,
    });
  }

  async removeServer(id: string): Promise<void> {
    this.servers.delete(id);
    this.transports.delete(id);
  }

  async updateServer(
    id: string,
    _patch: { enabled?: boolean; env?: Record<string, string> }
  ): Promise<void> {
    const config = this.servers.get(id);
    if (config && _patch.env) {
      config.env = { ...config.env, ..._patch.env };
    }
  }
}
