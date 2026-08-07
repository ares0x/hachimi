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
  /** H3.3: 单调递增事件序列号 */
  seq?: number;
  /** P0.4: 一次 run 内所有事件的关联 ID（事件溯源链路根） */
  correlationId?: string;
  /** P0.4: 触发本事件的父事件 ID（如 user_message 派生出的 tool_call） */
  parentEventId?: string;
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
    /** 用户附带的图片（data URL，仅用于历史渲染；本地优先落盘） */
    attachments?: Array<{ id: string; name?: string; mimeType: string; dataUrl: string }>;
  };
}

import type { NormalizedUsage } from "@hachimi/shared";

export interface AssistantMessageEvent extends BaseRuntimeEvent {
  type: "assistant_message";
  payload: {
    content: string;
    messageId?: string;
    durationMs?: number;
    usage?: NormalizedUsage & { costUsd?: number };
    /** 事件种类标记（如 subagent_notification）— 供投影/恢复管线区分普通助手回复 */
    kind?: string;
    /** 子代理通知对应的子会话 ID（kind=subagent_notification 时携带） */
    subSessionId?: string;
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
    /** P1.6: 大结果归档引用（格式 `{sessionId}/{toolCallId}`），可由 read_artifact 水合 */
    artifactRef?: string;
  };
}

export interface ApprovalRequestedEvent extends BaseRuntimeEvent {
  type: "approval_requested";
  payload: {
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    permission: string;
    diff?: string;
  };
}

export interface ApprovalGrantedEvent extends BaseRuntimeEvent {
  type: "approval_granted";
  payload: {
    approvalId: string;
    toolName: string;
    surface?: string;
    trustSession?: boolean;
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

export interface PlanModeChangedEvent extends BaseRuntimeEvent {
  type: "plan_mode_changed";
  payload: {
    mode: "normal" | "plan";
    planText?: string;
    by?: string;
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
    /** Durable run identifier — links this event to an AgentRun record */
    runId?: string;
    durationMs: number;
    success: boolean;
    summary?: string;
    usage?: NormalizedUsage & { costUsd?: number };
    /** P2-B8: 该 run 实际使用的模型 id（B6 路由后可能不同于连接默认模型） */
    model?: string;
  };
}

export interface VisionCompanionCallEvent extends BaseRuntimeEvent {
  type: "vision_companion_call";
  payload: {
    /** Vision companion model id that produced the descriptions. */
    model: string;
    /** Number of images described in this call batch. */
    imageCount: number;
    /** Number of images served from cache (no extra API call). */
    cacheHits: number;
    /** Folded usage of the vision companion calls. */
    usage?: NormalizedUsage & { costUsd?: number };
  };
}

export interface ThinkingEvent extends BaseRuntimeEvent {
  type: "thinking";
  payload: {
    content: string;
    durationMs?: number;
  };
}

/**
 * P0.4: Checkpoint — 可恢复状态锚点（供 P2.6 rewind / 事件回放使用）
 * 事件流本身是 append-only 事实；checkpoint 标记某个可视为一致状态的时间点，
 * 不存储快照数据本身，只存储引用（ref）。
 */
export interface CheckpointEvent extends BaseRuntimeEvent {
  type: "checkpoint";
  payload: {
    /** 检查点类别：文件系统 / Work / Git / 记忆 / 知识提纯 */
    kind: "fs" | "work" | "git" | "memory" | "knowledge";
    /** 人类可读标签（如 "run 完成"、"记忆已保存"） */
    label: string;
    /** 引用（如 runId、git commit hash、导出文件路径） */
    ref?: string;
    /** 知识提纯：生成的草稿文件路径 */
    draftFile?: string;
  };
}

/**
 * P2.6: File history snapshot — 文件历史快照（rewind 的数据载体）
 * 内容落盘到 {dataDir}/rewind/{sessionId}/{eventId}.md（避免事件流膨胀），
 * 事件只携带元数据 + ref；`rebuildSnapshotChain()` 从事件流重建每个文件的
 * 有序快照链，`/rewind` 可据此恢复到任意历史点。
 * 快照上限 FILE_HISTORY_MAX_SNAPSHOTS（默认 100）：超出后最旧的磁盘内容被
 * 淘汰（事件保留，append-only 语义不被破坏）。
 */
export interface FileHistorySnapshotEvent extends BaseRuntimeEvent {
  type: "file_history_snapshot";
  payload: {
    /** 快照对应的文件路径（工作区相对路径，保持可移植） */
    filePath: string;
    /** 快照语义：编辑前（写工具自动捕获）/ 编辑后 / 手动 checkpoint */
    mode: "before" | "after" | "manual";
    /** 内容引用（格式 `{sessionId}/{eventId}`，相对 rewind 根目录） */
    ref: string;
    /** 内容 SHA-256（用于去重与校验） */
    sha: string;
    /** 内容字节数 */
    size: number;
    /** 触发快照的工具名（如 write_file / delete_file），手动快照可空 */
    toolName?: string;
    /** 快照关联的消息 ID（可空：自动捕获时以 tool_call 为粒度） */
    messageId?: string;
  };
}

// ─── 联合类型 ────────────────────────────────────────────────────────────────

export type RuntimeEvent =
  | SessionStartedEvent
  | UserMessageEvent
  | AssistantMessageEvent
  | ThinkingEvent
  | ToolCallEvent
  | ToolResultEvent
  | ApprovalRequestedEvent
  | ApprovalGrantedEvent
  | ApprovalDeniedEvent
  | SteerEvent
  | PlanModeChangedEvent
  | VisionCompanionCallEvent
  | CheckpointEvent
  | FileHistorySnapshotEvent
  | ErrorEvent
  | RunFinishedEvent;

export type RuntimeEventType = RuntimeEvent["type"];

// ─── 投影：Activity（UI 展示层的统一视图） ────────────────────────────────────

export type ActivityType =
  | "message"
  | "tool"
  | "approval"
  | "steer"
  | "error"
  | "system"
  | "thinking";

export interface Activity {
  id: string;
  sessionId: string;
  type: ActivityType;
  timestamp: string;
  /** message 类型时的角色 */
  role?: "user" | "assistant" | "system";
  /** 人类可读的内容摘要 */
  content: string;
  /** 用户消息附带的图片（data URL），供历史缩略图渲染 */
  images?: string[];
  /** 工具相关字段 */
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  isToolError?: boolean;
  /** 执行耗时 (ms) */
  durationMs?: number;
  /** 审批相关字段 */
  approvalId?: string;
  approvalDecision?: "granted" | "denied" | "pending";
  /** 原始事件引用 */
  sourceEventIds?: string[];
}
