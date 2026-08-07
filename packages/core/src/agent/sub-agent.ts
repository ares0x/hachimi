// packages/core/src/agent/sub-agent.ts
import {
  DEFAULT_MAX_CONCURRENT_SUBAGENTS,
  formatSubAgentAsyncDispatchedMessage,
  formatSubAgentRecursionBlockedMessage,
  formatSubAgentSuccessSummaryMessage,
  formatSubAgentWorkerPrompt,
  generateId,
  log,
  SUB_AGENT_SESSION_PREFIX,
  SUBAGENT_CONTEXT_SUMMARY_MAX_CHARS,
  SUBAGENT_NOTIFY_MAX_CHARS,
  SUBAGENT_SUMMARY_MAX_CHARS,
  type SubAgentType,
} from "@hachimi/shared";
import type { HarnessRuntime } from "../runtime/harness-runtime.js";
import { SubAgentSidechain } from "../tasks/subagent-sidechain.js";
import type { TaskRegistry, TaskStateBase } from "../tasks/task-registry.js";
import type { SessionTrustLevel } from "../tools/policy.js";
import type { ToolApprovalHandler } from "../tools/types.js";
import type { ToolDefinition } from "../types/index.js";

export interface SubAgentRunOptions {
  taskDescription: string;
  /** Short summary of what the parent agent already knows — prevents redundant exploration */
  contextHint?: string;
  /**
   * P2: Structured context from the parent.
   * When set, the sub-agent prompt includes a focused summary so it doesn't
   * need the full system prompt context. Include: what files were read, key
   * findings, and what's still unknown.
   */
  contextSummary?: string;
  parentSessionId?: string;
  async?: boolean;
  /** H3.5: 子 Agent 派生下发的 Token 额度上限 */
  maxTokens?: number;
  /** H3.5: 子 Agent 派生下发的 $ 美金开销上限 */
  maxCostUSD?: number;
  /** 父会话来源表面（PermissionPolicy 对齐），子代理继承父级策略 */
  parentChannel?: string;
  /** 父会话信任级别 — 子代理继承且永不超出父级（Kun inherit 模式） */
  parentTrustLevel?: SessionTrustLevel;
  /** 父会话审批回调 — 子代理需要审批时升级到父会话的审批通道 */
  parentApprovalHandler?: ToolApprovalHandler;
  /** 父会话取消信号（同步模式透传；async 任务独立运行不跟随） */
  parentSignal?: AbortSignal;
  /** P2: 子代理角色类型 — 决定能力面与工作提示（默认 general-purpose） */
  subagentType?: SubAgentType;
  /**
   * P2-3: 子代理思考强度，默认 "none"（关闭 thinking，控成本/时延，
   * 参考 Claude Code 子任务默认轻量）。复杂分析任务可显式调高。
   */
  reasoningEffort?: "none" | "low" | "medium" | "high";
}

export type SubAgentTaskStatus = Extract<
  import("../tasks/task-registry.js").TaskStatus,
  "running" | "completed" | "failed" | "cancelled"
>;

export interface SubAgentTaskState extends TaskStateBase {
  taskId: string;
  taskKind: "subagent";
  subSessionId: string;
  parentSessionId?: string;
  taskDescription: string;
  status: SubAgentTaskStatus;
  summary?: string;
  durationMs: number;
  /** 内部取消控制器（agent_kill 使用），不属于对外投影 */
  controller?: AbortController;
}

export interface SubAgentResult {
  taskId: string;
  subSessionId: string;
  summary: string;
  durationMs: number;
  success: boolean;
  isAsyncRunning?: boolean;
}

export interface SubAgentDelegatorOptions {
  /** 最大并行运行中的子代理数，超额排队等待（默认 4，Kun maxParallel 模式） */
  maxConcurrent?: number;
  /** 每个父会话累计可派发的子代理总数上限（默认不限制，Kun maxChildRuns 模式） */
  maxChildRunsPerParent?: number;
  /** P1.7: 统一任务注册表（UI/Activity 聚合查询路径） */
  registry?: TaskRegistry;
  /** P1.3: 数据目录（sidechain 持久化，默认 "./data"） */
  dataDir?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** P1: 子代理未显式指定 maxTokens 时的兜底累计 token 预算。 */
export const DEFAULT_SUBAGENT_BUDGET_TOKENS = 48000;
/** P2.9: 子代理累计预算封顶（防失控；Claude Code 子任务预算同量级） */
export const MAX_SUBAGENT_BUDGET_TOKENS = 128_000;

/**
 * P1: 解析子代理默认累计 token 预算 — 模型未传 maxTokens 时按父会话上下文窗口
 * 的 3 倍给出（窗口按激活模型推断，非用户预算）。调研类任务普遍需要多轮工具调用，
 * 累计 usage（每轮 input 重复计入）远超单窗口大小——若预算只对齐窗口，
 * explore 子代理 2-3 轮后必然触发闸门。结果收敛到 [48k, 128k]（下限保证调研余量，
 * 上限防失控）。父窗口未知时回退到 DEFAULT_SUBAGENT_BUDGET_TOKENS。
 */
export function defaultSubAgentBudgetTokens(parentContextMaxTokens?: number): number {
  if (parentContextMaxTokens && parentContextMaxTokens > 0) {
    return Math.min(
      MAX_SUBAGENT_BUDGET_TOKENS,
      Math.max(DEFAULT_SUBAGENT_BUDGET_TOKENS, parentContextMaxTokens * 3)
    );
  }
  return DEFAULT_SUBAGENT_BUDGET_TOKENS;
}

/** P2: 只读能力面（explore/plan/reviewer）允许的工具判定 */
const READ_ONLY_TOOL_KINDS = new Set(["read", "search", "calc"]);
const READ_ONLY_EXTRA_TOOLS = new Set(["mcp_fetch_url"]);

function isReadOnlyTool(t: ToolDefinition): boolean {
  if (t.readOnly === true) return true;
  if (t.name === "save_memory") return false; // 记忆写入不属于只读
  if (READ_ONLY_EXTRA_TOOLS.has(t.name)) return true;
  return (
    t.kind !== undefined && READ_ONLY_TOOL_KINDS.has(t.kind) && (t.permission ?? "safe") === "safe"
  );
}

function truncateText(text: string, maxChars: number, hint: string): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[内容过长已截断，${hint}]`;
}

/**
 * Sub-Agent delegator (SubAgentDelegator) supporting sync/async non-blocking dispatch,
 * status tracking, concurrency backpressure, cancellation, and batch wait.
 */
export class SubAgentDelegator {
  private tasks: Map<string, SubAgentTaskState> = new Map();
  private readonly maxTasks = 100;
  private readonly maxConcurrent: number;
  private readonly maxChildRunsPerParent?: number;
  private readonly registry?: TaskRegistry;
  private readonly sidechain: SubAgentSidechain;
  private running = 0;
  private waitQueue: Array<() => void> = [];
  private childRunsByParent = new Map<string, number>();

  constructor(
    private runtime: HarnessRuntime,
    options: SubAgentDelegatorOptions = {}
  ) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT_SUBAGENTS);
    this.maxChildRunsPerParent = options.maxChildRunsPerParent;
    this.registry = options.registry;
    this.sidechain = new SubAgentSidechain(options.dataDir ?? "./data");
  }

  /** LRU eviction to prevent task state memory leaks in long-running sessions */
  private pruneTasks(): void {
    if (this.tasks.size < this.maxTasks) return;
    const entries = Array.from(this.tasks.entries()).sort(
      ([, a], [, b]) => a.createdAt - b.createdAt
    );
    for (const [id, state] of entries) {
      if (state.status !== "running") {
        this.tasks.delete(id);
        if (this.tasks.size < this.maxTasks * 0.8) break;
      }
    }
  }

  /** 信号量：并发上限内直接放行，超额排队（背压而非报错） */
  private async acquireSlot(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    this.running++;
  }

  private releaseSlot(): void {
    this.running--;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  /** 当前正在运行（含排队前已获槽位）的子代理数 — 供测试与观测 */
  getRunningCount(): number {
    return this.running;
  }

  /** P1.3: 任务状态快照写入 sidechain（append-only，进程重启后可重建） */
  private writeSidechain(state: SubAgentTaskState): void {
    this.sidechain.append(state.subSessionId, {
      taskId: state.taskId,
      subSessionId: state.subSessionId,
      status: state.status,
      summary: state.summary,
      error: state.error,
      durationMs: state.durationMs,
      updatedAt: state.updatedAt,
    });
  }

  /** P1.3: 启动时孤儿恢复 — 上次进程遗留的 running 子代理标记为 failed */
  recoverOrphanedSubAgents(): number {
    return this.sidechain.markOrphanedRunning();
  }

  /** Get task state — exact match first, then unique prefix match (LLMs often truncate long IDs). */
  getTaskState(taskId: string): SubAgentTaskState | undefined {
    const exact = this.tasks.get(taskId);
    if (exact) return exact;

    // Prefix match: taskId may be truncated (e.g. "task_sub_c2ab6e02" vs full UUID).
    // 前缀歧义时返回 undefined，避免查错任务（调用方会提示未找到/需要完整 ID）。
    const trimmed = taskId.trim();
    if (trimmed.length >= 8) {
      let match: SubAgentTaskState | undefined;
      for (const [id, state] of this.tasks) {
        if (id.startsWith(trimmed) || trimmed.startsWith(id)) {
          if (match) return undefined; // 多个匹配 → 歧义
          match = state;
        }
      }
      if (match) return match;

      // P1.3: 内存状态已丢失（进程重启）→ 从 sidechain 重建（需要完整 subSessionId）
      const persisted = this.sidechain.readLastState(trimmed);
      if (persisted) {
        return {
          taskId: persisted.taskId,
          taskKind: "subagent",
          subSessionId: persisted.subSessionId,
          taskDescription: "",
          status: persisted.status,
          summary: persisted.summary,
          error: persisted.error,
          durationMs: persisted.durationMs,
          createdAt: persisted.updatedAt,
          updatedAt: persisted.updatedAt,
        };
      }
      return undefined;
    }
    return undefined;
  }

  /** List all sub-agent task states */
  listTaskStates(): SubAgentTaskState[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 取消一个运行中的子代理（AbortController 触发，LLM 调用/工具链会中止） */
  cancelTask(taskId: string): boolean {
    const state = this.getTaskState(taskId);
    if (!state || state.status !== "running" || !state.controller) return false;
    state.controller.abort();
    return true;
  }

  /**
   * P2.8: 等待一个或多个子代理任务完成（后台命令管理器只跟踪 shell 命令，
   * 子代理必须由这里轮询 — wait_commands_or_subagents 依赖此方法才能真正等待）。
   * mode="any" 首个完成即返回；mode="all" 等待全部完成或超时。
   */
  async waitForTasks(
    taskIds: string[],
    mode: "any" | "all" = "all",
    timeoutMs = 30000
  ): Promise<SubAgentTaskState[]> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    let states: SubAgentTaskState[] = [];
    // 轮询粒度：200ms，避免空转 CPU 也保持较快响应
    const pollMs = 200;

    while (true) {
      states = taskIds
        .map((id) => this.getTaskState(id))
        .filter((s): s is SubAgentTaskState => s !== undefined);
      const done = states.filter((s) => s.status !== "running");
      if (mode === "any" && done.length > 0) return done;
      if (mode === "all" && done.length === states.length) return states;
      if (Date.now() >= deadline) return states;
      await sleep(pollMs);
    }
  }

  /** async 子代理完成/失败/取消后，向父会话事件流写入完成通知（UI Activity 可见） */
  private async notifyParentCompletion(
    parentSessionId: string,
    state: SubAgentTaskState
  ): Promise<void> {
    try {
      const summaryForNotify = truncateText(
        state.summary ?? state.error ?? "",
        SUBAGENT_NOTIFY_MAX_CHARS,
        `完整输出见子会话 ${state.subSessionId} 事件流`
      );
      const statusLine =
        state.status === "completed"
          ? `结果摘要：\n${summaryForNotify}`
          : `错误：${summaryForNotify}`;
      await this.runtime.events.append({
        id: generateId("evt_"),
        sessionId: parentSessionId,
        type: "assistant_message",
        timestamp: new Date().toISOString(),
        payload: {
          content: `[子 Agent 完成通知] TaskId: ${state.taskId}\n状态：${state.status}\n${statusLine}`,
          // P1: 标记为子代理通知 — UI 投影为紧凑系统行（非助手气泡），
          // 且会话恢复时跳过，避免完成通知回流进模型上下文。
          kind: "subagent_notification",
          subSessionId: state.subSessionId,
        },
      });
    } catch {
      /* 通知失败不影响任务结果 */
    }
  }

  /**
   * Run or dispatch sub-agent task
   */
  async runSubAgent(options: SubAgentRunOptions): Promise<SubAgentResult> {
    const taskId = generateId("task_sub_");
    const subSessionId = generateId(SUB_AGENT_SESSION_PREFIX);
    const startTime = Date.now();
    const controller = new AbortController();

    const taskState: SubAgentTaskState = {
      taskId,
      taskKind: "subagent",
      subSessionId,
      parentSessionId: options.parentSessionId,
      taskDescription: options.taskDescription,
      status: "running",
      durationMs: 0,
      createdAt: startTime,
      updatedAt: startTime,
      controller,
    };
    this.pruneTasks();
    this.tasks.set(taskId, taskState);
    this.registry?.registerTask(taskState);
    this.writeSidechain(taskState);

    log("info", `🚀 [SubAgent Spawning] TaskId: ${taskId} | SubSessionId: ${subSessionId}`, {
      parentSessionId: options.parentSessionId,
      async: options.async ?? false,
      task: options.taskDescription,
    });

    // P2: Build focused prompt with parent context（contextSummary 超限截断，防撑爆子代理上下文）
    let fullTaskDescription = options.taskDescription;
    if (options.contextSummary) {
      const truncatedCtx = truncateText(
        options.contextSummary,
        SUBAGENT_CONTEXT_SUMMARY_MAX_CHARS,
        "父 Agent 已掌握信息被截断，可按需自行探索补充"
      );
      fullTaskDescription =
        `【父 Agent 已掌握的信息】\n${truncatedCtx}\n\n` +
        `【你的任务】\n${options.taskDescription}\n` +
        `（注意：上面已列出的信息不需要重新探索，直接基于已有信息完成任务。）`;
    } else if (options.contextHint) {
      fullTaskDescription = `${options.taskDescription}\n背景参考：${options.contextHint}`;
    }
    // 防御：非法角色值回退 general-purpose（只读面与提示保持一致的保守默认）
    const subagentType: SubAgentType =
      options.subagentType === "explore" ||
      options.subagentType === "plan" ||
      options.subagentType === "reviewer"
        ? options.subagentType
        : "general-purpose";
    const prompt = formatSubAgentWorkerPrompt(fullTaskDescription, subagentType);

    // P2: 角色能力面 — explore/plan/reviewer 为只读面（allowedTools 硬性收窄）
    const readOnly = subagentType !== "general-purpose";
    const allowedTools = readOnly
      ? this.runtime.tools
          .list()
          .filter((t) => isReadOnlyTool(t))
          .map((t) => t.name)
      : undefined;

    const executeChildTask = async (): Promise<SubAgentResult> => {
      // 每父会话累计派发上限（Kun maxChildRuns）
      if (options.parentSessionId && this.maxChildRunsPerParent !== undefined) {
        const used = this.childRunsByParent.get(options.parentSessionId) ?? 0;
        if (used >= this.maxChildRunsPerParent) {
          const msg = `[子 Agent 派发上限] 父会话已累计派发 ${used} 个子任务，达到上限 ${this.maxChildRunsPerParent}，本次派发被拒绝。`;
          taskState.status = "failed";
          taskState.error = msg;
          taskState.summary = msg;
          taskState.durationMs = Date.now() - startTime;
          taskState.updatedAt = Date.now();
          this.writeSidechain(taskState);
          this.registry?.updateTaskState<SubAgentTaskState>(taskId, {
            status: "failed",
            error: msg,
            summary: msg,
            durationMs: taskState.durationMs,
          });
          if (options.async && options.parentSessionId) {
            await this.notifyParentCompletion(options.parentSessionId, taskState);
          }
          return { taskId, subSessionId, summary: msg, durationMs: 0, success: false };
        }
        this.childRunsByParent.set(options.parentSessionId, used + 1);
      }

      // 可取消：async 独立控制；sync 同时跟随父信号与任务自身控制。
      // runSignal 同时用于 catch 中止判定，父信号中止（如沙箱超时 abort）
      // 应归类为 cancelled 而非 failed。
      const runSignal = options.async
        ? controller.signal
        : options.parentSignal
          ? AbortSignal.any([options.parentSignal, controller.signal])
          : controller.signal;

      // 并发背压：acquire → 执行 → release
      await this.acquireSlot();
      try {
        // P0-5: 子 Agent 继承父 Work 的项目工作区根，保持 jail 作用域一致
        const parentWork = options.parentSessionId
          ? this.runtime.works.get(options.parentSessionId)
          : undefined;
        const output = await this.runtime.execute({
          prompt,
          sessionId: subSessionId,
          // 继承父会话 surface + trust（永不超出父级），而非降级到 minimal
          channel: options.parentChannel ?? "sub-agent",
          workspaceRoot: parentWork?.workspaceRoot,
          trustLevel: options.parentTrustLevel,
          signal: runSignal,
          options: {
            maxRounds: 5,
            // 审批升级：子代理需要确认时走父会话的审批通道（如桌面 SSE pendingApprovals）
            onToolApproval: options.parentApprovalHandler,
            // H3.5: 配额真正下发到子 Agent 的 run 预算
            usageBudget: {
              maxTokens: options.maxTokens,
              maxCostUSD: options.maxCostUSD,
            },
            // P2: 角色能力面 — 只读面仅公布只读工具（执行时硬拦截）
            allowedTools,
            // P2-3: 子代理默认关闭 thinking（成本/时延可控，产出交给工具与搜索）
            reasoningEffort: options.reasoningEffort ?? "none",
          },
        });

        const durationMs = Date.now() - startTime;
        taskState.status = "completed";
        taskState.summary = output.content; // 完整输出保留在任务状态
        taskState.durationMs = durationMs;
        taskState.updatedAt = Date.now();
        this.writeSidechain(taskState);
        this.registry?.updateTaskState<SubAgentTaskState>(taskId, {
          status: "completed",
          summary: output.content,
          durationMs,
        });

        log("info", `✅ [SubAgent Finished] TaskId: ${taskId} (${durationMs}ms)`);

        // P2: 输出隔离 — 回传父 Agent 的摘要限长（完整输出在子会话事件流 / 任务状态）
        const summaryForParent = truncateText(
          output.content,
          SUBAGENT_SUMMARY_MAX_CHARS,
          `完整输出见子会话 ${subSessionId} 事件流（可用 agent_output 查询任务状态）`
        );

        return {
          taskId,
          subSessionId,
          summary: summaryForParent,
          durationMs,
          success: !output.isError,
        };
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const errMsg = err?.message || String(err);
        taskState.status = runSignal.aborted ? "cancelled" : "failed";
        taskState.error = errMsg;
        taskState.summary = runSignal.aborted
          ? `[子 Agent 已取消] TaskId: ${taskId}（被 agent_kill 或父会话中止）`
          : `[子 Agent 执行失败] ${errMsg}`;
        taskState.durationMs = durationMs;
        taskState.updatedAt = Date.now();
        this.writeSidechain(taskState);
        this.registry?.updateTaskState<SubAgentTaskState>(taskId, {
          status: taskState.status,
          error: errMsg,
          summary: taskState.summary,
          durationMs,
        });

        log("error", `❌ [SubAgent ${taskState.status}] TaskId: ${taskId}`, { error: err });

        return {
          taskId,
          subSessionId,
          summary: taskState.summary,
          durationMs,
          success: false,
        };
      } finally {
        this.releaseSlot();
        // async 完成通知：写入父会话事件流（UI Activity 可见）
        if (options.async && options.parentSessionId) {
          await this.notifyParentCompletion(options.parentSessionId, taskState);
        }
      }
    };

    // 异步非阻塞模式 (Async Mode): 在 50ms 内立即返回 taskId，后台独立运行
    if (options.async) {
      setImmediate(() => {
        void executeChildTask();
      });

      return {
        taskId,
        subSessionId,
        summary: formatSubAgentAsyncDispatchedMessage(taskId),
        durationMs: Date.now() - startTime,
        success: true,
        isAsyncRunning: true,
      };
    }

    // 同步等待模式 (Sync Mode)
    return await executeChildTask();
  }

  /**
   * H6.2: 多 Worker 并行派发与结果 Join 汇流（并发由信号量统一限流）
   */
  async runParallelSubAgents(tasksOptions: SubAgentRunOptions[]): Promise<SubAgentResult[]> {
    log(
      "info",
      `⚡ [SubAgent Parallel Dispatching] Spawning ${tasksOptions.length} parallel sub-agent workers...`
    );
    const promises = tasksOptions.map((opt) => this.runSubAgent(opt));
    return await Promise.all(promises);
  }

  /**
   * 工具 1: 派发子 Agent `delegate_subagent`
   */
  getDelegationTool(): ToolDefinition {
    return {
      name: "delegate_subagent",
      description:
        "Dispatches an autonomous isolated sub-agent worker for independent sub-tasks (complex research, error stack analysis, code review, etc.). " +
        "Use subagentType to pick the capability surface: explore (read-only research), plan (read-only planning), reviewer (read-only audit), or general-purpose (full tools). " +
        "Sync mode (default) waits for the sub-agent to finish (bounded by a 10-minute timeout). " +
        "For parallel long-running tasks, prefer async:true for each dispatch, then wait for ALL of them in ONE call with agent_output (taskIds=[...], mode=all, timeoutMs up to 600000) — " +
        "do NOT poll check_subagent_status in a loop (each poll costs an LLM round and bloats the parent context).",
      // P2: 派发即消耗子代理额度/配额，入口需要确认（父会话审批通道可见）
      permission: "needs_confirm",
      // 嵌套 run（LLM 多轮 + 工具链）远超普通工具 30s 上限 — 覆盖为 10 分钟，
      // 与 run_dag / start_goal 的异步编排一致，避免同步派发被沙箱超时误杀。
      timeoutMs: 600_000,
      parameters: {
        type: "object",
        properties: {
          taskDescription: {
            type: "string",
            description: "Detailed task description for the sub-agent to execute independently",
          },
          subagentType: {
            type: "string",
            enum: ["general-purpose", "explore", "plan", "reviewer"],
            description:
              "Sub-agent role / capability surface: general-purpose (full tools, default), explore (read-only research), plan (read-only planning), reviewer (read-only audit). Read-only types cannot edit files, run commands, or write memory.",
          },
          contextSummary: {
            type: "string",
            description:
              "P2: Structured context from the parent (files already read, key findings, open questions). Over 8000 chars it is truncated to protect the sub-agent context window.",
          },
          contextHint: {
            type: "string",
            description: "Optional background reference or constraint notes",
          },
          async: {
            type: "boolean",
            description:
              "If true, dispatches sub-agent asynchronously in non-blocking background mode (default is false)",
          },
          maxTokens: {
            type: "number",
            description:
              "Optional token budget cap for this sub-agent run (input + output + cache). " +
              "Exceeding it gracefully ends the run with a partial summary. " +
              "If omitted, defaults to 3x the parent session's context window budget (min 48k).",
          },
          maxCostUSD: {
            type: "number",
            description:
              "Optional estimated USD cost cap for this sub-agent run. Exceeding it gracefully ends the run with a partial summary.",
          },
          reasoningEffort: {
            type: "string",
            enum: ["none", "low", "medium", "high"],
            description:
              "Reasoning/thinking effort for the sub-agent run. Default 'none' disables thinking (cheaper, faster); use 'low'/'medium'/'high' for complex analysis tasks that need step-by-step reasoning.",
          },
        },
        required: ["taskDescription"],
      },
      execute: async (args, ctx) => {
        const {
          taskDescription,
          subagentType,
          contextSummary,
          contextHint,
          async: isAsync,
          maxTokens,
          maxCostUSD,
          reasoningEffort,
        } = args as {
          taskDescription: string;
          subagentType?: SubAgentType;
          contextSummary?: string;
          contextHint?: string;
          async?: boolean;
          maxTokens?: number;
          maxCostUSD?: number;
          reasoningEffort?: "none" | "low" | "medium" | "high";
        };
        const parentSessionId = ctx?.sessionId;

        if (parentSessionId?.startsWith(SUB_AGENT_SESSION_PREFIX)) {
          return formatSubAgentRecursionBlockedMessage();
        }

        // P1: 模型未显式传 maxTokens 时，按父会话上下文窗口给出默认累计预算，
        // 与父 Agent 的预算闸门对齐（父窗口经 config.context.maxTokens 取得）。
        const resolvedMaxTokens =
          maxTokens ??
          // P2.9: 子代理预算基座 = 激活模型窗口（而非用户组装预算），
          // 窗口 ×3 clamp 到 [48k, 128k] — 深调研（如六目录并行）需要足够余量
          defaultSubAgentBudgetTokens(this.runtime.context?.agent?.contextWindowTokens);

        const result = await this.runSubAgent({
          taskDescription,
          subagentType,
          contextSummary,
          contextHint,
          parentSessionId,
          async: isAsync,
          maxTokens: resolvedMaxTokens,
          maxCostUSD,
          reasoningEffort,
          // P0: 继承父会话的 surface / 信任级别 / 审批通道 / 取消信号
          parentChannel: ctx?.channel,
          parentTrustLevel: ctx?.trustLevel,
          parentApprovalHandler: ctx?.onToolApproval,
          parentSignal: ctx?.signal,
        });

        if (result.isAsyncRunning) {
          return result.summary;
        }

        return formatSubAgentSuccessSummaryMessage(result.taskId, result.summary);
      },
    };
  }

  /**
   * 工具 2: 检查子 Agent 异步任务状态 `check_subagent_status`
   */
  getCheckStatusTool(): ToolDefinition {
    return {
      name: "check_subagent_status",
      description:
        "Checks execution status and result summary of a background asynchronous sub-agent task by task ID.",
      permission: "safe",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description:
              "Sub-agent Task ID (e.g., task_sub_xxx) extracted from conversation context",
          },
        },
        required: ["taskId"],
      },
      execute: async (args) => {
        const { taskId } = args as { taskId: string };
        const state = this.getTaskState(taskId);

        if (!state) {
          return `未找到 Task ID 为 '${taskId}' 的子 Agent 任务。`;
        }

        if (state.status === "running") {
          return `[子 Agent 状态: 进行中 (Running)] TaskId: ${taskId}\n任务描述：${state.taskDescription}\n已运行耗时：${Date.now() - state.createdAt} ms。请稍后重新查询。`;
        }

        if (state.status === "failed") {
          return `[子 Agent 状态: 失败 (Failed)] TaskId: ${taskId}\n错误详情：${state.error}\n总耗时：${state.durationMs} ms。`;
        }

        if (state.status === "cancelled") {
          return `[子 Agent 状态: 已取消 (Cancelled)] TaskId: ${taskId}\n总耗时：${state.durationMs} ms。`;
        }

        return `[子 Agent 状态: 已完成 (Completed)] TaskId: ${taskId}\n总耗时：${state.durationMs} ms\n处理结果总结：\n${state.summary}`;
      },
    };
  }

  /**
   * 工具 3: 列出子 Agent 任务 `agent_list`
   */
  getListTool(): ToolDefinition {
    return {
      name: "agent_list",
      description:
        "Lists all sub-agent tasks (running / completed / failed / cancelled) with taskId, status, duration, and description.",
      permission: "safe",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["running", "completed", "failed", "cancelled"],
            description: "Optional status filter",
          },
        },
      },
      execute: async (args) => {
        const { status } = args as { status?: string };
        const states = this.listTaskStates().filter((s) => (status ? s.status === status : true));
        if (states.length === 0) {
          return "当前没有任何子 Agent 任务。";
        }
        return states
          .map(
            (s) =>
              `- ${s.taskId} | ${s.status} | ${s.durationMs}ms | ${s.taskDescription.slice(0, 80)}`
          )
          .join("\n");
      },
    };
  }

  /**
   * 工具 4: 批量等待子 Agent 结果 `agent_output`（grok wait_commands_or_subagents 模式）
   */
  getOutputTool(): ToolDefinition {
    return {
      name: "agent_output",
      description:
        "Waits for one or more sub-agent tasks and returns their final status + summary. " +
        "mode=any returns as soon as the first task completes; mode=all waits for every task (default). " +
        "timeoutMs caps the wait (default 120000, max 600000). " +
        "This is the PREFERRED way to wait for async sub-agents: it blocks inside the harness without extra LLM rounds — " +
        "never poll check_subagent_status in a loop.",
      permission: "safe",
      // 批量等待可达 10 分钟（与 delegate_subagent 一致），覆盖沙箱默认 30s 超时，
      // 避免等待 6 个并行调研子代理时被沙箱熔断。
      timeoutMs: 600_000,
      parameters: {
        type: "object",
        properties: {
          taskIds: {
            type: "array",
            items: { type: "string" },
            description: "Sub-agent Task IDs to wait for (e.g. from agent_list)",
          },
          mode: {
            type: "string",
            enum: ["any", "all"],
            description: "wait_any returns on first completion; wait_all waits for every task",
          },
          timeoutMs: {
            type: "number",
            description: "Maximum wait in milliseconds (default 120000, max 600000)",
          },
        },
        required: ["taskIds"],
      },
      execute: async (args) => {
        const {
          taskIds,
          mode = "all",
          timeoutMs = 120000,
        } = args as {
          taskIds: string[];
          mode?: "any" | "all";
          timeoutMs?: number;
        };
        if (!Array.isArray(taskIds) || taskIds.length === 0) {
          return "请提供至少一个 taskIds。";
        }
        const targets = taskIds
          .map((id) => this.getTaskState(id))
          .filter((s): s is SubAgentTaskState => !!s);
        if (targets.length === 0) {
          return "未找到任何匹配的子 Agent 任务。";
        }
        const isDone = (s: SubAgentTaskState) => s.status !== "running";
        const deadline = Date.now() + Math.max(0, Math.min(600000, Number(timeoutMs) || 120000));
        while (Date.now() < deadline) {
          if (mode === "any" ? targets.some(isDone) : targets.every(isDone)) break;
          await sleep(100);
        }
        return targets
          .map((s) => {
            const head = `[${s.status}] ${s.taskId} (${s.durationMs}ms)`;
            if (s.status === "running") return `${head} — 仍在运行，等待超时。`;
            return `${head}\n${s.summary ?? s.error ?? ""}`;
          })
          .join("\n---\n");
      },
    };
  }

  /**
   * 工具 5: 取消子 Agent 任务 `agent_kill`
   */
  getKillTool(): ToolDefinition {
    return {
      name: "agent_kill",
      description:
        "Cancels a running sub-agent task (aborts its LLM/tool loop). Reports success if the task was killed or had already exited.",
      permission: "safe",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "Sub-agent Task ID to cancel",
          },
        },
        required: ["taskId"],
      },
      execute: async (args) => {
        const { taskId } = args as { taskId: string };
        const state = this.getTaskState(taskId);
        if (!state) {
          return `未找到 Task ID 为 '${taskId}' 的子 Agent 任务。`;
        }
        if (state.status !== "running") {
          return `任务 ${taskId} 已结束（状态：${state.status}），无需取消。`;
        }
        const killed = this.cancelTask(taskId);
        return killed
          ? `已向子 Agent 任务 ${taskId} 发送取消信号，任务将尽快中止。`
          : `任务 ${taskId} 无法取消（可能已完成或缺少取消句柄）。`;
      },
    };
  }
}
