// packages/core/src/goal/goal-machine.ts
//
// P2.1: Goal 状态机（纯逻辑，无 IO）— planning → acting → verifying → completed/failed/paused。
// 参考 grok `goal_tracker.rs`：BackOffPaused / NoProgressPaused / InfraPaused 三类暂停、
// 停滞检测（连续 2 次相同 gap 指纹）、运行次数上限（默认 10）。
// 验证由外部注入 N 个 reviewer 的判定结果（majority-refute 视为未完成）。

import { createHash } from "node:crypto";

export type GoalPhase = "planning" | "acting" | "verifying" | "completed" | "failed" | "paused";

export type GoalPauseReason = "backoff" | "no-progress" | "infra";

export interface GoalVerdict {
  reviewerId: string;
  approve: boolean;
  reason: string;
}

export interface GoalMachineState {
  goalId: string;
  objective: string;
  phase: GoalPhase;
  /** 已执行的 acting run 次数 */
  runCount: number;
  maxRuns: number;
  /** 连续停滞轮数（相同 gap 指纹） */
  consecutiveStalls: number;
  lastGapFingerprint?: string;
  pauseReason?: GoalPauseReason;
  /** backoff 暂停后允许自动恢复的时间戳 */
  pausedUntil?: number;
  plan?: string;
  lastRunSummary?: string;
  verdicts: GoalVerdict[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export const GOAL_DEFAULT_MAX_RUNS = 10;
export const GOAL_STALL_THRESHOLD = 2;
export const GOAL_DEFAULT_REVIEWERS = 3;
export const GOAL_BACKOFF_MS = 60_000;

/** gap 指纹：归一化执行摘要后取 SHA-256（空白折叠 + 前 2000 字符） */
export function gapFingerprint(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ").slice(0, 2000);
  return createHash("sha256").update(normalized, "utf-8").digest("hex");
}

/**
 * 纯状态机：所有转移都是同步纯函数，返回新状态。
 * 外部（GoalRunner）负责持久化与副作用（LLM / 子代理 / 事件）。
 */
export class GoalMachine {
  private state: GoalMachineState;

  constructor(initial: GoalMachineState) {
    this.state = { ...initial };
  }

  /** 初始状态：planning */
  static start(objective: string, opts: { goalId: string; maxRuns?: number }): GoalMachineState {
    const now = Date.now();
    return {
      goalId: opts.goalId,
      objective,
      phase: "planning",
      runCount: 0,
      maxRuns: opts.maxRuns ?? GOAL_DEFAULT_MAX_RUNS,
      consecutiveStalls: 0,
      verdicts: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  getState(): GoalMachineState {
    return { ...this.state };
  }

  /** 计划就绪 → acting */
  markPlanReady(plan: string): GoalMachineState {
    this.state = {
      ...this.state,
      phase: "acting",
      plan,
      updatedAt: Date.now(),
    };
    return this.getState();
  }

  /**
   * 一次 acting run 完成：runCount+1、停滞检测。
   * 连续 GOAL_STALL_THRESHOLD（默认 2）个相同指纹 → no-progress 暂停。
   * 运行次数上限不在此处暂停（否则会跳过验证）；上限约束由 runner 循环
   * 与 recordVerdicts（驳回且耗尽次数 → failed）共同承担。
   */
  markRunCompleted(summary: string): GoalMachineState {
    const fp = gapFingerprint(summary);
    // 当前相同指纹连击长度：与上一轮相同则 +1，否则重置为 1（首轮为 1）
    const identical = this.state.lastGapFingerprint === fp;
    const consecutiveStalls = identical ? this.state.consecutiveStalls + 1 : 1;
    const runCount = this.state.runCount + 1;
    const now = Date.now();

    let phase: GoalPhase = "acting";
    let pauseReason: GoalPauseReason | undefined;
    let error: string | undefined;

    if (consecutiveStalls >= GOAL_STALL_THRESHOLD) {
      phase = "paused";
      pauseReason = "no-progress";
      error = `连续 ${consecutiveStalls} 轮执行结果无实质进展（相同 gap 指纹），已暂停。`;
    }

    this.state = {
      ...this.state,
      phase,
      runCount,
      consecutiveStalls,
      lastGapFingerprint: fp,
      lastRunSummary: summary,
      pauseReason,
      pausedUntil: undefined,
      ...(error ? { error } : {}),
      updatedAt: now,
    };
    return this.getState();
  }

  /** acting → verifying */
  markVerifying(): GoalMachineState {
    if (this.state.phase !== "acting") return this.getState();
    this.state = { ...this.state, phase: "verifying", updatedAt: Date.now() };
    return this.getState();
  }

  /**
   * 记录 N 个 reviewer 的判定（majority-refute → 未完成）。
   * 未完成且仍有 run 余量 → 回到 acting（由 runner 注入异议反馈）；否则 failed。
   */
  recordVerdicts(verdicts: GoalVerdict[]): GoalMachineState {
    if (this.state.phase !== "verifying") return this.getState();
    const refutes = verdicts.filter((v) => !v.approve).length;
    const majorityRefute = refutes >= Math.ceil(verdicts.length / 2);

    let phase: GoalPhase;
    let error: string | undefined;
    if (!majorityRefute) {
      phase = "completed";
    } else if (this.state.runCount < this.state.maxRuns) {
      phase = "acting";
    } else {
      phase = "failed";
      error = `多数评审员驳回了完成声明（${refutes}/${verdicts.length} REFUTE），且已用尽运行次数。`;
    }

    this.state = {
      ...this.state,
      phase,
      verdicts,
      ...(error ? { error } : {}),
      updatedAt: Date.now(),
    };
    return this.getState();
  }

  /** 基础设施/工具失败 → infra 暂停（等待环境恢复后 resume） */
  markInfraPause(detail: string): GoalMachineState {
    this.state = {
      ...this.state,
      phase: "paused",
      pauseReason: "infra",
      error: detail,
      updatedAt: Date.now(),
    };
    return this.getState();
  }

  /** 通用暂停（backoff/no-progress/infra） */
  pause(reason: GoalPauseReason, detail?: string, until?: number): GoalMachineState {
    this.state = {
      ...this.state,
      phase: "paused",
      pauseReason: reason,
      pausedUntil: until,
      ...(detail ? { error: detail } : {}),
      updatedAt: Date.now(),
    };
    return this.getState();
  }

  /** 恢复执行：backoff 未到期则拒绝；恢复后重置停滞计数，给一次新机会 */
  resume(now = Date.now()): GoalMachineState {
    if (this.state.phase !== "paused") return this.getState();
    if (
      this.state.pauseReason === "backoff" &&
      this.state.pausedUntil &&
      now < this.state.pausedUntil
    ) {
      return this.getState();
    }
    this.state = {
      ...this.state,
      phase: "acting",
      pauseReason: undefined,
      pausedUntil: undefined,
      consecutiveStalls: 0,
      lastGapFingerprint: undefined,
      updatedAt: now,
    };
    return this.getState();
  }

  /** 显式失败（规划失败等） */
  markFailed(detail: string): GoalMachineState {
    this.state = {
      ...this.state,
      phase: "failed",
      error: detail,
      updatedAt: Date.now(),
    };
    return this.getState();
  }
}
