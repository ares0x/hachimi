/**
 * W1: Work — 工作单元类型定义
 *
 * Work 是比 Session 更高层的一等公民：代表一件要完成的事（目标+计划+状态）。
 * Session/Run 是 Work 的执行容器。
 * 初始阶段：workId === sessionId（1:1 映射），后续可拆分为 1:N。
 */

// ─── Plan Step ───────────────────────────────────────────────────────────────

export type PlanStepStatus = "pending" | "running" | "done" | "skipped";

export interface PlanStep {
  id: string;
  title: string;
  status: PlanStepStatus;
  /** 可选的详细描述 */
  description?: string;
  /** 步骤完成时间戳 */
  completedAt?: string;
}

// ─── Work Status ─────────────────────────────────────────────────────────────

export type WorkStatus =
  | "active" // 正在执行
  | "waiting" // 等待用户输入或审批
  | "blocked" // 策略拒绝或错误需人处理
  | "completed" // 正常结束
  | "cancelled" // 用户取消
  | "failed" // 失败结束
  | "archived"; // 用户归档

// ─── Work Kind ───────────────────────────────────────────────────────────────

export type WorkKind =
  | "primary" // 用户直接发起的主 Work
  | "worker"; // 子 Agent 派发的 Worker 任务（默认不展示在 Rail）

// ─── Work ────────────────────────────────────────────────────────────────────

export interface Work {
  /** 唯一 ID（初始阶段 = sessionId） */
  id: string;
  /** 人类可读标题（非时间戳） */
  title: string;
  /** 用户原始意图（首条消息或显式声明） */
  goal?: string;
  /** 当前状态 */
  status: WorkStatus;
  /** 可选步骤计划（无则 UI 退化为纯 Activity 流） */
  plan: PlanStep[];
  /** 关联的 Session ID 列表（初始阶段只有一个） */
  sessionIds: string[];
  /** 是否为 worker 任务（子 Agent 派发） */
  kind: WorkKind;
  /** 父 Work ID（仅 worker 任务有） */
  parentWorkId?: string;
  /** ISO-8601 创建时间 */
  createdAt: string;
  /** ISO-8601 最后更新时间 */
  updatedAt: string;
  /** 可扩展元数据 */
  metadata?: Record<string, unknown>;
}

// ─── Work List Item（列表 API 轻量返回）────────────────────────────────────────

export interface WorkSummary {
  id: string;
  title: string;
  status: WorkStatus;
  kind: WorkKind;
  goal?: string;
  planTotal: number;
  planDone: number;
  updatedAt: string;
  createdAt: string;
  /** worker 任务的父 Work ID，UI 可据此关联子任务 */
  parentWorkId?: string;
}
