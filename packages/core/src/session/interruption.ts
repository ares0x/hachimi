/**
 * P2-B1: Session interruption classification.
 *
 * Derives *why* a session's last run was interrupted by inspecting the event
 * tail (append-only truth) — the run store is a convenience, the event stream
 * is authoritative. Pattern: maka `classifyAgentRunRecovery`.
 *
 * Kinds:
 *   - completed          last event is `run_finished` with success=true
 *   - cancelled          last event is `run_finished` with success=false
 *   - waiting_approval   last event is `approval_requested` (approval never answered)
 *   - tool_interrupted   last event is `tool_call` with no matching `tool_result`
 *   - stream_interrupted a model turn started (assistant/thinking/user/steer)
 *                        but no terminal `run_finished` / `error` followed
 *   - error              last event is `error`
 *   - unknown            nothing meaningful to infer
 */
import type { RuntimeEvent } from "../types/event.js";

export type SessionInterruptionKind =
  | "completed"
  | "cancelled"
  | "waiting_approval"
  | "tool_interrupted"
  | "stream_interrupted"
  | "error"
  | "unknown";

export interface SessionInterruption {
  kind: SessionInterruptionKind;
  /** Event type of the last event in the stream */
  lastEventType?: string;
  /** Tool whose result never arrived (tool_interrupted) */
  pendingToolName?: string;
  /** Tool waiting for a human decision (waiting_approval) */
  pendingApprovalToolName?: string;
  /** Last error message (error kind) */
  lastError?: string;
  eventCount: number;
}

const TERMINAL_EVENT_TYPES = new Set(["run_finished", "error"]);
const PROGRESS_EVENT_TYPES = new Set([
  "user_message",
  "assistant_message",
  "thinking",
  "steer",
  "plan_mode_changed",
]);

/** Inspect the event tail and classify how the last run ended. */
export function classifySessionInterruption(events: readonly RuntimeEvent[]): SessionInterruption {
  const eventCount = events.length;
  if (eventCount === 0) {
    return { kind: "unknown", eventCount };
  }

  const last = events[eventCount - 1];
  const base = { lastEventType: last.type, eventCount };

  if (last.type === "run_finished") {
    return {
      ...base,
      kind: last.payload.success === false ? "cancelled" : "completed",
    };
  }

  if (last.type === "error") {
    return {
      ...base,
      kind: "error",
      lastError: last.payload.message,
    };
  }

  if (last.type === "approval_requested") {
    return {
      ...base,
      kind: "waiting_approval",
      pendingApprovalToolName: last.payload.toolName,
    };
  }

  if (last.type === "tool_call") {
    return {
      ...base,
      kind: "tool_interrupted",
      pendingToolName: last.payload.toolName,
    };
  }

  if (PROGRESS_EVENT_TYPES.has(last.type)) {
    // A turn is in flight but no terminal event arrived → interrupted mid-stream.
    return { ...base, kind: "stream_interrupted" };
  }

  return { ...base, kind: "unknown" };
}

/** Human-readable hint for recovery UX (CLI / Activity projection). */
export function interruptionHint(interruption: SessionInterruption): string {
  switch (interruption.kind) {
    case "completed":
      return "上次运行已正常完成";
    case "cancelled":
      return "上次运行被取消或失败结束";
    case "waiting_approval":
      return `上次运行在等待审批时中断（${interruption.pendingApprovalToolName ?? "工具"}）— 可恢复会话后重新审批或继续`;
    case "tool_interrupted":
      return `上次运行在工具执行中被中断（${interruption.pendingToolName ?? "未知工具"}）— 可恢复会话后重试`;
    case "stream_interrupted":
      return "上次运行在模型输出过程中被中断（进程退出/网络断开）— 可恢复会话后继续";
    case "error":
      return `上次运行以错误结束：${interruption.lastError ?? "未知错误"}`;
    default:
      return "无法推断上次运行状态";
  }
}
