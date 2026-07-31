// packages/core/src/extensions/mcp-types.ts

export type McpProtocolVersion = "2024-11-05" | "2026-07-28";

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  protocolVersion?: McpProtocolVersion;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
  handler?: (
    args?: Record<string, any>
  ) => Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }>;
}

export interface McpMeta {
  protocolVersion: string;
  clientCapabilities?: Record<string, unknown>;
  invocationId?: string;
}

export interface McpDiscoverResult {
  protocolVersion: string;
  supportedVersions: string[];
  capabilities?: Record<string, unknown>;
}

/**
 * MCP 2026-07-28 MRTR 多轮请求结果
 */
export interface McpMrtrResult {
  resultType?: "success" | "input_required" | "error";
  content?: string;
  requiredInputKey?: string;
  promptMessage?: string;
}

/**
 * IMcpTransport 抽象传输层接口
 * 支持向下兼容 2024-11-05 (Stdio/SSE) 与向上支持 2026-07-28 (Stateless HTTP/MRTR)
 */
export interface IMcpTransport {
  readonly version: McpProtocolVersion;
  listTools(): Promise<McpToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
}
