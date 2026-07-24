// packages/core/src/extensions/mcp-client.ts
import type { ToolDefinition } from "../types/index.js";
import type { CapabilitySource } from "./capability.js";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

/**
 * E4: Model Context Protocol (MCP) 客户端管理器
 * 实现 CapabilitySource<ToolDefinition> 范式，无缝将外部 MCP Tools 接入 ToolRegistry
 */
export class McpClientManager implements CapabilitySource<ToolDefinition> {
  public id = "mcp-client-source";
  public type = "mcp" as const;

  private servers: Map<string, McpServerConfig> = new Map();
  private mcpTools: Map<string, ToolDefinition> = new Map();

  constructor(configs: Record<string, McpServerConfig> = {}) {
    for (const [name, config] of Object.entries(configs)) {
      this.registerServer(name, config);
    }
  }

  registerServer(name: string, config: McpServerConfig): void {
    this.servers.set(name, config);
  }

  /**
   * 注册 Mock / 直接注入的 MCP 工具（用于敏捷测试与扩展）
   */
  registerMcpTool(
    serverName: string,
    tool: McpToolDefinition,
    handler: (args: any) => Promise<string>
  ): ToolDefinition {
    const qualifiedName = `mcp_${serverName}_${tool.name}`;
    const toolDef: ToolDefinition = {
      name: qualifiedName,
      description: tool.description || `MCP [${serverName}] 工具: ${tool.name}`,
      permission: "safe",
      parameters: tool.inputSchema || { type: "object", properties: {} },
      execute: async (args) => handler(args),
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
}
