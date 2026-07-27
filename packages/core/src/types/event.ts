/**
 * W0: RuntimeEvent — 执行真相源类型定义
 *
 * 所有 Agent 执行过程中发生的事实均以 RuntimeEvent 形式追加落盘。
 * 事件只追加，不修改，不删除。
 */

// ─── 基础字段 ────────────────────────────────────────────────────────────────

export interface BaseRuntimeEvent {
  /** 全局唯一事件 ID */
  id: string;
  /** 所属 Session ID */
  sessionId: string;
  /** ISO-8601 时间戳 */
  timestamp: string;
}

// ─── 各事件类型 ───────────────────────────────────────────────────────────────

export interface SessionStartedEvent extends BaseRuntimeEvent {
  type: "session_started";
  payload: {
    title?: string;
    channel?: string;
  };
}

export interface UserMessageEvent extends BaseRuntimeEvent {
  type: "user_message";
  payload: {
    content: string;
    channel?: string;
    messageId?: string;
  };
}

export interface AssistantMessageEvent extends BaseRuntimeEvent {
  type: "assistant_message";
  payload: {
    content: string;
    messageId?: string;
    durationMs?: number;
  };
}

export interface ToolCallEvent extends BaseRuntimeEvent {
  type: "tool_call";
  payload: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  };
}

export interface ToolResultEvent extends BaseRuntimeEvent {
  type: "tool_result";
  payload: {
    toolCallId: string;
    toolName: string;
    result: string;
    isError: boolean;
    durationMs?: number;
  };
}

export interface ApprovalRequestedEvent extends BaseRuntimeEvent {
  type: "approval_requested";
  payload: {
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    permission: string;
  };
}

export interface ApprovalGrantedEvent extends BaseRuntimeEvent {
  type: "approval_granted";
  payload: {
    approvalId: string;
    toolName: string;
    surface?: string;
  };
}

export interface ApprovalDeniedEvent extends BaseRuntimeEvent {
  type: "approval_denied";
  payload: {
    approvalId: string;
    toolName: string;
    surface?: string;
    reason?: string;
  };
}

export interface SteerEvent extends BaseRuntimeEvent {
  type: "steer";
  payload: {
    prompt: string;
  };
}

export interface ErrorEvent extends BaseRuntimeEvent {
  type: "error";
  payload: {
    message: string;
    stack?: string;
    phase?: string;
  };
}

export interface RunFinishedEvent extends BaseRuntimeEvent {
  type: "run_finished";
  payload: {
    durationMs: number;
    success: boolean;
    summary?: string;
  };
}

// ─── 联合类型 ────────────────────────────────────────────────────────────────

export type RuntimeEvent =
  | SessionStartedEvent
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolCallEvent
  | ToolResultEvent
  | ApprovalRequestedEvent
  | ApprovalGrantedEvent
  | ApprovalDeniedEvent
  | SteerEvent
  | ErrorEvent
  | RunFinishedEvent;

export type RuntimeEventType = RuntimeEvent["type"];

// ─── 投影：Activity（UI 展示层的统一视图） ────────────────────────────────────

export type ActivityType = "message" | "tool" | "approval" | "steer" | "error" | "system";

export interface Activity {
  id: string;
  sessionId: string;
  type: ActivityType;
  timestamp: string;
  /** message 类型时的角色 */
  role?: "user" | "assistant" | "system";
  /** 人类可读的内容摘要 */
  content: string;
  /** 工具相关字段 */
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  isToolError?: boolean;
  /** 审批相关字段 */
  approvalId?: string;
  approvalDecision?: "granted" | "denied" | "pending";
  /** 原始事件引用 */
  sourceEventIds?: string[];
}
