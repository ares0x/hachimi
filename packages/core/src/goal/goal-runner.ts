// packages/core/src/goal/goal-runner.ts
//
// P2.1: Goal 编排器 — 在既有 agent loop 之上叠加 goal 模式：
//   planning（plan 子代理）→ acting（目标会话中的完整 agent run）→
//   verifying（N 个并行 reviewer 子代理 majority 投票）。
// 停滞检测 / 运行次数上限 / 三类暂停由 GoalMachine 纯状态机负责；
// 本类只做副作用编排（LLM 调用、子代理、任务注册表投影）。
//
// 注入点可替换（deps）以便单测：默认实现走 HarnessRuntime。

import { generateId, log } from "@hachimi/shared";
import type { HarnessRuntime, RuntimeInput } from "../runtime/harness-runtime.js";
import type { TaskRegistry, TaskStateBase } from "../tasks/task-registry.js";
import type { SessionTrustLevel } from "../tools/policy.js";
import type { ToolDefinition } from "../types/index.js";
import {
  GOAL_DEFAULT_REVIEWERS,
  GoalMachine,
  type GoalMachineState,
  type GoalPauseReason,
  type GoalPhase,
  type GoalVerdict,
} from "./goal-machine.js";

/** 执行代理签名（默认走 runtime；测试可注入假实现） */
export interface GoalRunnerDeps {
  plan?: (
    taskDescription: string,
    parentSessionId: string | undefined
  ) => Promise<{ success: boolean; summary: string }>;
  review?: (
    taskDescription: string,
    parentSessionId: string | undefined
  ) => Promise<{ success: boolean; summary: string }>;
  act?: (
    prompt: string,
    opts: ActOpts
  ) => Promise<{ content: string; isError?: boolean; errorDetail?: string }>;
}

export interface ActOpts {
  sessionId?: string;
  channel?: string;
  trustLevel?: SessionTrustLevel;
  workspaceRoot?: string;
  signal?: AbortSignal;
}

export interface GoalStartInput extends ActOpts {
  objective: string;
  /** 用户可见的父会话（子代理完成通知落点）；acting 使用专用 goal 会话避免重入 */
  parentSessionId?: string;
  maxRuns?: number;
  /** 并行 reviewer 数量，默认 3 */
  reviewers?: number;
  /** 异步后台执行（工具调用必须为 true，避免 30s 沙箱超时） */
  async?: boolean;
}

/** 任务注册表投影（P1.7 统一任务状态） */
export interface GoalTaskState extends TaskStateBase {
  taskKind: "goal";
  goalId: string;
  objective: string;
  phase: GoalPhase;
  runCount: number;
  maxRuns: number;
  pauseReason?: GoalPauseReason;
  plan?: string;
  lastRunSummary?: string;
  verdicts: GoalVerdict[];
  error?: string;
}

interface GoalExecution extends Required<Pick<GoalStartInput, "objective" | "reviewers">> {
  state: GoalMachineState;
  /** 用户可见父会话（子代理通知落点） */
  parentSessionId?: string;
  channel?: string;
  trustLevel?: SessionTrustLevel;
  workspaceRoot?: string;
  signal?: AbortSignal;
  /** 上一轮评审异议反馈（注入下一次 acting prompt） */
  feedback: string[];
}

/** 解析 reviewer 输出中的裁决（VERDICT: APPROVE|REFUTE），无标记按 REFUTE 保守处理 */
export function parseVerdict(summary: string, reviewerId: string): GoalVerdict {
  const m =
    summary.match(/\bVERDICT:\s*(APPROVE|REFUTE)\b/i) ?? summary.match(/\b(APPROVE|REFUTE)\b/i);
  if (!m) {
    return {
      reviewerId,
      approve: false,
      reason: "评审输出缺少明确 VERDICT 标记（保守按未通过处理）",
    };
  }
  const approve = m[1].toUpperCase() === "APPROVE";
  const reason = summary.slice(0, 800).trim();
  return { reviewerId, approve, reason };
}

export class GoalRunner {
  private executions = new Map<string, GoalExecution>();
  private readonly deps: Required<GoalRunnerDeps>;

  constructor(
    private readonly runtime: HarnessRuntime,
    private readonly registry?: TaskRegistry,
    deps?: GoalRunnerDeps
  ) {
    this.deps = {
      plan: deps?.plan ?? ((task, parentSessionId) => this.defaultPlan(task, parentSessionId)),
      review:
        deps?.review ?? ((task, parentSessionId) => this.defaultReview(task, parentSessionId)),
      act: deps?.act ?? ((prompt, opts) => this.defaultAct(prompt, opts)),
    };
  }

  /** 启动一个 goal（同步阻塞或异步后台） */
  async startGoal(input: GoalStartInput): Promise<{ goalId: string; state: GoalMachineState }> {
    const goalId = generateId("goal_");
    const state = GoalMachine.start(input.objective, { goalId, maxRuns: input.maxRuns });
    this.executions.set(goalId, {
      state,
      objective: input.objective,
      reviewers: input.reviewers ?? GOAL_DEFAULT_REVIEWERS,
      parentSessionId: input.parentSessionId,
      channel: input.channel,
      trustLevel: input.trustLevel,
      workspaceRoot: input.workspaceRoot,
      signal: input.signal,
      feedback: [],
    });
    this.syncTask(state);

    if (input.async) {
      setImmediate(() => {
        void this.runGoal(goalId);
      });
    } else {
      await this.runGoal(goalId);
    }
    return { goalId, state: this.getGoal(goalId) ?? state };
  }

  getGoal(goalId: string): GoalMachineState | undefined {
    return this.executions.get(goalId)?.state;
  }

  listGoals(): GoalMachineState[] {
    return [...this.executions.values()].map((e) => e.state);
  }

  /** 恢复暂停的 goal（backoff 未到期则忽略） */
  resumeGoal(goalId: string): GoalMachineState | undefined {
    const exec = this.executions.get(goalId);
    if (!exec) return undefined;
    const m = new GoalMachine(exec.state);
    const resumed = m.resume();
    exec.state = resumed;
    this.syncTask(resumed);
    if (resumed.phase === "acting") {
      setImmediate(() => {
        void this.runGoal(goalId);
      });
    }
    return resumed;
  }

  // ─── 编排核心 ───────────────────────────────────────────────────────────────

  private async runGoal(goalId: string): Promise<void> {
    const exec = this.executions.get(goalId);
    if (!exec) return;
    const m = new GoalMachine(exec.state);

    // 1. planning
    if (m.getState().phase === "planning") {
      const planTask = `为以下目标制定一份可执行的实现计划（分步骤、涉及文件、验证方式、风险）：\n${exec.objective}`;
      const planRes = await this.deps.plan(planTask, exec.parentSessionId);
      if (!planRes.success) {
        m.markFailed("规划子代理执行失败，无法进入执行阶段。");
      } else {
        m.markPlanReady(planRes.summary);
      }
      exec.state = m.getState();
      this.syncTask(exec.state);
      if (exec.state.phase !== "acting") {
        this.finish(goalId);
        return;
      }
    }

    // 2. acting + verifying 循环
    while (m.getState().phase === "acting" && m.getState().runCount < m.getState().maxRuns) {
      const prompt = this.buildActingPrompt(exec);
      const out = await this.deps.act(prompt, {
        sessionId: this.goalSessionId(goalId),
        channel: exec.channel,
        trustLevel: exec.trustLevel,
        workspaceRoot: exec.workspaceRoot,
        signal: exec.signal,
      });
      if (out.isError) {
        m.markInfraPause(out.errorDetail ?? "acting 执行失败（基础设施/工具错误）");
        exec.state = m.getState();
        this.syncTask(exec.state);
        break;
      }

      m.markRunCompleted(out.content);
      exec.state = m.getState();
      this.syncTask(exec.state);
      if (exec.state.phase !== "acting") break; // paused（no-progress / run cap）

      // 3. verifying
      m.markVerifying();
      exec.state = m.getState();
      this.syncTask(exec.state);
      const verdicts = await this.runReviewers(exec);
      m.recordVerdicts(verdicts);
      exec.state = m.getState();
      exec.feedback = verdicts.filter((v) => !v.approve).map((v) => v.reason);
      this.syncTask(exec.state);
      if (exec.state.phase === "acting") {
        log(
          "info",
          `[Goal] ${goalId} 未通过评审（${verdicts.filter((v) => !v.approve).length}/${verdicts.length} REFUTE），继续下一轮 acting`
        );
      }
    }

    this.finish(goalId);
  }

  private async runReviewers(exec: GoalExecution): Promise<GoalVerdict[]> {
    const n = exec.reviewers;
    const state = exec.state;
    const taskBody = [
      `目标：${exec.objective}`,
      state.plan ? `计划：\n${state.plan}` : "计划：无",
      `最近一次执行结果：\n${state.lastRunSummary ?? "（无）"}`,
      "请逐项核对目标是否真正完成，检查是否有 bug、未覆盖的验收点或伪造证据。",
      "回复必须以单独一行结束：VERDICT: APPROVE 或 VERDICT: REFUTE，并附具体证据。",
    ].join("\n\n");

    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        this.deps.review(`评审员 ${i + 1}/${n}\n${taskBody}`, exec.parentSessionId)
      )
    );
    return results.map((r, i) => parseVerdict(r.summary, `reviewer-${i + 1}`));
  }

  private buildActingPrompt(exec: GoalExecution): string {
    const lines = [
      `目标：${exec.objective}`,
      exec.state.plan ? `执行计划：\n${exec.state.plan}` : "",
      "请严格按计划执行以实现上述目标。完成后用 2-3 句话说明你完成了什么、验证了什么、还有哪些未覆盖。",
    ];
    if (exec.feedback.length > 0) {
      lines.push(
        `上一轮评审员提出的异议（必须逐条回应并解决，不能忽略）：\n- ${exec.feedback.join("\n- ")}`
      );
    }
    return lines.filter(Boolean).join("\n\n");
  }

  private goalSessionId(goalId: string): string {
    return `goal_${goalId}`;
  }

  private finish(goalId: string): void {
    const exec = this.executions.get(goalId);
    if (!exec) return;
    const phase = exec.state.phase;
    if (phase === "completed" || phase === "failed") {
      log("info", `[Goal] ${goalId} 结束 (${phase}) runCount=${exec.state.runCount}`);
    }
    // 保留 executions 记录供 goal_status / goal_list 查询
  }

  // ─── 默认实现（真实运行时） ─────────────────────────────────────────────────

  private async defaultPlan(task: string, parentSessionId: string | undefined) {
    const res = await this.runtime.subAgentDelegator.runSubAgent({
      taskDescription: task,
      subagentType: "plan",
      parentSessionId,
      async: false,
    });
    return { success: res.success, summary: res.summary };
  }

  private async defaultReview(task: string, parentSessionId: string | undefined) {
    const res = await this.runtime.subAgentDelegator.runSubAgent({
      taskDescription: task,
      subagentType: "reviewer",
      parentSessionId,
      async: false,
    });
    return { success: res.success, summary: res.summary };
  }

  private async defaultAct(prompt: string, opts: ActOpts) {
    const out = await this.runtime.execute({
      prompt,
      sessionId: opts.sessionId,
      channel: opts.channel as RuntimeInput["channel"],
      trustLevel: opts.trustLevel,
      workspaceRoot: opts.workspaceRoot,
      signal: opts.signal,
      options: { maxRounds: 15 },
    });
    return { content: out.content, isError: out.isError, errorDetail: out.errorDetail };
  }

  // ─── 任务注册表投影（P1.7） ─────────────────────────────────────────────────

  private syncTask(state: GoalMachineState): void {
    if (!this.registry) return;
    const existing = this.registry.getTask<GoalTaskState>(state.goalId);
    const status =
      state.phase === "completed" ? "completed" : state.phase === "failed" ? "failed" : "running";
    const base: GoalTaskState = {
      taskId: state.goalId,
      taskKind: "goal",
      goalId: state.goalId,
      objective: state.objective,
      phase: state.phase,
      runCount: state.runCount,
      maxRuns: state.maxRuns,
      pauseReason: state.pauseReason,
      plan: state.plan,
      lastRunSummary: state.lastRunSummary,
      verdicts: state.verdicts,
      error: state.error,
      status,
      createdAt: existing?.createdAt ?? state.createdAt,
      updatedAt: Date.now(),
    };
    if (existing) {
      this.registry.updateTaskState<GoalTaskState>(state.goalId, base);
    } else {
      this.registry.registerTask(base);
    }
  }

  // ─── 工具面 ─────────────────────────────────────────────────────────────────

  /** 工具 1: 启动 goal（工具场景默认异步，避免沙箱 30s 超时） */
  getStartGoalTool(): ToolDefinition {
    return {
      name: "start_goal",
      kind: "meta",
      description:
        "Starts a goal-mode execution: plans (read-only plan sub-agent), acts (full agent run in a dedicated goal session), then verifies completion with N parallel adversarial reviewer sub-agents (majority-refute → another acting round). Use for multi-step objectives that need verification, e.g. 'refactor module X and make tests pass'.",
      permission: "needs_confirm",
      parameters: {
        type: "object",
        properties: {
          objective: {
            type: "string",
            description: "The concrete goal to achieve (e.g. refactor + test requirements)",
          },
          reviewers: {
            type: "number",
            description: "Number of parallel reviewer sub-agents (default 3)",
          },
        },
        required: ["objective"],
      },
      execute: async (args, ctx) => {
        const objective = String(args.objective ?? "").trim();
        if (!objective) return "[start_goal] objective is required";
        const reviewers = Number(args.reviewers ?? GOAL_DEFAULT_REVIEWERS);
        const result = await this.startGoal({
          objective,
          parentSessionId: ctx?.sessionId,
          channel: ctx?.channel,
          trustLevel: ctx?.trustLevel,
          reviewers,
          async: true,
        });
        return `[Goal 已启动] goalId=${result.goalId}（异步后台执行）。\n目标：${objective}\n\n使用 goal_status（goalId=${result.goalId}）查询进度，goal_list 查看全部。`;
      },
    };
  }

  /** 工具 2: 查询 goal 状态 */
  getStatusTool(): ToolDefinition {
    return {
      name: "goal_status",
      kind: "read",
      description:
        "Queries the status of a goal-mode execution by goalId: phase (planning/acting/verifying/completed/failed/paused), run count, plan, last run summary, and reviewer verdicts.",
      permission: "safe",
      readOnly: true,
      parameters: {
        type: "object",
        properties: {
          goalId: { type: "string", description: "Goal ID (e.g. goal_xxx) from start_goal" },
        },
        required: ["goalId"],
      },
      execute: async (args) => {
        const goalId = String(args.goalId ?? "");
        const state = this.getGoal(goalId);
        if (!state) return `未找到 goalId=${goalId} 的 Goal 任务。`;
        const lines = [
          `[Goal 状态] ${state.phase} | runs=${state.runCount}/${state.maxRuns} | goalId=${goalId}`,
          `目标：${state.objective}`,
        ];
        if (state.pauseReason)
          lines.push(
            `暂停原因：${state.pauseReason}${state.pausedUntil ? `（${new Date(state.pausedUntil).toISOString()} 后可恢复）` : ""}`
          );
        if (state.error) lines.push(`错误：${state.error}`);
        if (state.plan) lines.push(`计划：\n${state.plan.slice(0, 600)}`);
        if (state.lastRunSummary)
          lines.push(`最近执行摘要：\n${state.lastRunSummary.slice(0, 600)}`);
        if (state.verdicts.length > 0) {
          lines.push(
            `评审判定（${state.verdicts.filter((v) => v.approve).length}/${state.verdicts.length} APPROVE）：`
          );
          for (const v of state.verdicts) {
            lines.push(
              `- ${v.reviewerId}: ${v.approve ? "APPROVE" : "REFUTE"} — ${v.reason.slice(0, 300)}`
            );
          }
        }
        return lines.join("\n");
      },
    };
  }

  /** 工具 3: 列出全部 goal */
  getListTool(): ToolDefinition {
    return {
      name: "goal_list",
      kind: "read",
      description: "Lists all goal-mode executions with goalId, phase, run count, and objective.",
      permission: "safe",
      readOnly: true,
      parameters: { type: "object", properties: {}, required: [] },
      execute: async () => {
        const goals = this.listGoals();
        if (goals.length === 0) return "当前没有任何 Goal 任务。";
        return goals
          .map((g) => `- ${g.goalId} [${g.phase}] runs=${g.runCount}/${g.maxRuns} — ${g.objective}`)
          .join("\n");
      },
    };
  }
}
