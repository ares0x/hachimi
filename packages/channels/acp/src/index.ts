// packages/channels/acp/src/index.ts
// Public entry for the ACP (Agent Client Protocol) stdio channel.

export type {
  AcpApprovalResolver,
  AcpInitializeResult,
  AcpNotification,
  AcpSessionInfo,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./protocol.js";
export type { AcpServerDeps } from "./server.js";
export { createAcpServer, main } from "./server.js";
