// packages/core/src/extensions/mcp-types.ts

export type McpProtocolVersion = "2024-11-05" | "2026-07-28";

export interface McpServerConfig {
  /** Server id（默认与注册名一致） */
  id?: string;
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  protocolVersion?: McpProtocolVersion;
  enabled?: boolean;
  /** 该 Server 工具的默认权限级别；未设置时按工具注解推导，默认 needs_confirm */
  permission?: "safe" | "needs_confirm" | "dangerous";
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
  /** 工具注解：用于推导 Hachimi 权限级别 */
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
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
  /** P0.2: 释放底层资源（关闭子进程/连接）；无状态传输可为空实现 */
  close?(): Promise<void> | void;
}
