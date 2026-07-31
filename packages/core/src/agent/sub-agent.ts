// packages/core/src/agent/sub-agent.ts
import {
  formatSubAgentAsyncDispatchedMessage,
  formatSubAgentRecursionBlockedMessage,
  formatSubAgentSuccessSummaryMessage,
  formatSubAgentWorkerPrompt,
  generateId,
  log,
} from "@hachimi/shared";
import type { HarnessRuntime } from "../runtime/harness-runtime.js";
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
}

export interface SubAgentTaskState {
  taskId: string;
  subSessionId: string;
  parentSessionId?: string;
  taskDescription: string;
  status: "running" | "completed" | "failed";
  summary?: string;
  error?: string;
  durationMs: number;
  createdAt: number;
  updatedAt: number;
}

export interface SubAgentResult {
  taskId: string;
  subSessionId: string;
  summary: string;
  durationMs: number;
  success: boolean;
  isAsyncRunning?: boolean;
}

/**
 * Sub-Agent delegator (SubAgentDelegator) supporting sync/async non-blocking dispatch and status tracking
 */
export class SubAgentDelegator {
  private tasks: Map<string, SubAgentTaskState> = new Map();

  constructor(private runtime: HarnessRuntime) {}

  /** Get task state */
  getTaskState(taskId: string): SubAgentTaskState | undefined {
    return this.tasks.get(taskId);
  }

  /** List all sub-agent task states */
  listTaskStates(): SubAgentTaskState[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Run or dispatch sub-agent task
   */
  async runSubAgent(options: SubAgentRunOptions): Promise<SubAgentResult> {
    const taskId = generateId("task_sub_");
    const subSessionId = generateId("sub_sess_");
    const startTime = Date.now();

    const taskState: SubAgentTaskState = {
      taskId,
      subSessionId,
      parentSessionId: options.parentSessionId,
      taskDescription: options.taskDescription,
      status: "running",
      durationMs: 0,
      createdAt: startTime,
      updatedAt: startTime,
    };
    this.tasks.set(taskId, taskState);

    log("info", `🚀 [SubAgent Spawning] TaskId: ${taskId} | SubSessionId: ${subSessionId}`, {
      parentSessionId: options.parentSessionId,
      async: options.async ?? false,
      task: options.taskDescription,
    });

    // P2: Build focused prompt with parent context
    let fullTaskDescription = options.taskDescription;
    if (options.contextSummary) {
      fullTaskDescription =
        `【父 Agent 已掌握的信息】\n${options.contextSummary}\n\n` +
        `【你的任务】\n${options.taskDescription}\n` +
        `（注意：上面已列出的信息不需要重新探索，直接基于已有信息完成任务。）`;
    } else if (options.contextHint) {
      fullTaskDescription = `${options.taskDescription}\n背景参考：${options.contextHint}`;
    }
    const prompt = formatSubAgentWorkerPrompt(fullTaskDescription);

    const executeChildTask = async (): Promise<SubAgentResult> => {
      try {
        const output = await this.runtime.execute({
          prompt,
          sessionId: subSessionId,
          channel: "sub-agent",
          options: {
            maxRounds: 5,
          },
        });

        const durationMs = Date.now() - startTime;
        taskState.status = "completed";
        taskState.summary = output.content;
        taskState.durationMs = durationMs;
        taskState.updatedAt = Date.now();

        log("info", `✅ [SubAgent Finished] TaskId: ${taskId} (${durationMs}ms)`);

        return {
          taskId,
          subSessionId,
          summary: output.content,
          durationMs,
          success: !output.isError,
        };
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const errMsg = err?.message || String(err);
        taskState.status = "failed";
        taskState.error = errMsg;
        taskState.summary = `[子 Agent 执行失败] ${errMsg}`;
        taskState.durationMs = durationMs;
        taskState.updatedAt = Date.now();

        log("error", `❌ [SubAgent Failed] TaskId: ${taskId}`, { error: err });

        return {
          taskId,
          subSessionId,
          summary: taskState.summary,
          durationMs,
          success: false,
        };
      }
    };

    // 异步非阻塞模式 (Async Mode): 在 50ms 内立即返回 taskId，后台独立运行
    if (options.async) {
      setImmediate(() => {
        executeChildTask();
      });

      return {
        taskId,
        subSessionId,
        summary: `[子 Agent 已成功在后台异步启动 (Task ID: ${taskId})]\n任务描述：${options.taskDescription}\n该任务正在后台独立处理中，主对话控制台不会被阻塞。你可以随时通过 check_subagent_status 工具传入 taskId 检查结果。`,
        durationMs: Date.now() - startTime,
        success: true,
        isAsyncRunning: true,
      };
    }

    // 同步等待模式 (Sync Mode)
    return await executeChildTask();
  }

  /**
   * H6.2: 多 Worker 并行派发与结果 Join 汇流
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
        "Dispatches an autonomous isolated sub-agent worker for independent sub-tasks (complex research, error stack analysis, code review, etc.).",
      permission: "safe",
      parameters: {
        type: "object",
        properties: {
          taskDescription: {
            type: "string",
            description: "Detailed task description for the sub-agent to execute independently",
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
        },
        required: ["taskDescription"],
      },
      execute: async (args, ctx) => {
        const {
          taskDescription,
          contextHint,
          async: isAsync,
        } = args as {
          taskDescription: string;
          contextHint?: string;
          async?: boolean;
        };
        const parentSessionId = ctx?.sessionId;

        if (parentSessionId?.startsWith("sub_sess_")) {
          return formatSubAgentRecursionBlockedMessage();
        }

        const result = await this.runSubAgent({
          taskDescription,
          contextHint,
          parentSessionId,
          async: isAsync,
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

        return `[子 Agent 状态: 已完成 (Completed)] TaskId: ${taskId}\n总耗时：${state.durationMs} ms\n处理结果总结：\n${state.summary}`;
      },
    };
  }
}
