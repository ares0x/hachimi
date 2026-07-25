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
  contextHint?: string;
  parentSessionId?: string;
  async?: boolean;
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

    const fullTaskDescription = options.contextHint
      ? `${options.taskDescription}\n背景参考：${options.contextHint}`
      : options.taskDescription;
    const prompt = formatSubAgentWorkerPrompt(fullTaskDescription);

    const executeChildTask = async (): Promise<SubAgentResult> => {
      try {
        const output = await this.runtime.execute({
          prompt,
          sessionId: subSessionId,
          channel: "sub-agent",
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
   * 工具 1: 派发子 Agent `delegate_subagent`
   */
  getDelegationTool(): ToolDefinition {
    return {
      name: "delegate_subagent",
      description:
        "【自主/隔离派发】仅当任务匹配复杂技术调研、长报错分析、代码审查或耗时计算等独立子任务场景时调用此工具派发后台子 Agent。简单问答切勿派发。耗时分析建议设 async: true！",
      permission: "safe",
      parameters: {
        type: "object",
        properties: {
          taskDescription: {
            type: "string",
            description: "需要子 Agent 独立处理的详细任务描述",
          },
          contextHint: {
            type: "string",
            description: "可选的背景参考信息或约束说明",
          },
          async: {
            type: "boolean",
            description: "是否以非阻塞异步方式后台派发 (默认为 false)。耗时分析强烈推荐设为 true！",
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
        "查询后台异步子 Agent 任务的运行状态与结果总结。当用户输入‘查看结果’、‘好了吗’等口语化指令且未显式指定 taskId 时，请自动从上文中提取最新的 task_sub_xxx ID 传入此工具进行查询。",
      permission: "safe",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "子 Agent 任务的 Task ID (如 task_sub_xxx)。请从上下文中匹配提取",
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
