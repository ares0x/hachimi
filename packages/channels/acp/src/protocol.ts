// packages/channels/acp/src/protocol.ts
// P1: ACP (Agent Client Protocol) 子集 — JSON-RPC 2.0 over stdio
// 参考 grok-build xai-acp-lib / t3code effect-acp 的会话控制面语义。

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export type AcpNotification =
  | {
      method: "session/update";
      params: {
        sessionId: string;
        type: "message_delta" | "message_complete" | "tool_call" | "tool_result" | "status";
        content?: string;
        toolName?: string;
        isError?: boolean;
      };
    }
  | {
      method: "session/action/request";
      params: {
        actionId: string;
        sessionId: string;
        toolName: string;
        args: Record<string, unknown>;
        permission: string;
      };
    };

export interface AcpInitializeResult {
  protocolVersion: number;
  agentCapabilities: {
    supportsPromptCaching: boolean;
    supportsAbort: boolean;
    supportsLoad: boolean;
    supportsActionRequests: boolean;
    permissions: string[];
    channels: string[];
  };
}

export interface AcpSessionInfo {
  sessionId: string;
  title?: string;
  messageCount: number;
  updatedAt: number;
}

/** 会话运行期间由 client 注入的审批解析回调 */
export interface AcpApprovalResolver {
  wait: (actionId: string, timeoutMs: number) => Promise<boolean>;
  cancel: (actionId: string) => void;
}
