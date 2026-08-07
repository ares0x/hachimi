// packages/core/src/tools/builtin/shell/background-tasks.ts
// P0-3: 后台任务统一工具（Grok Build 模式）
//   - get_command_or_subagent_output: 查询后台命令/子 Agent 输出与状态
//   - wait_commands_or_subagents: 等待一个或多个任务完成
//   - kill_command_or_subagent: 终止后台命令任务
import type { ToolDefinition, ToolExecContext } from "../../types.js";

/** 等待结果中每个子代理内联摘要的最大字符数（完整内容用 agent_output 查询） */
const SUBAGENT_VIEW_MAX_CHARS = 600;

function formatSubAgentView(sub: {
  taskId: string;
  status: string;
  summary?: string;
  error?: string;
  durationMs?: number;
}): string {
  const statusLabel: Record<string, string> = {
    running: "运行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  };
  const body = sub.status === "completed" ? sub.summary : sub.error || sub.summary || "";
  return (
    `[子 Agent 任务] ${sub.taskId} | 状态: ${statusLabel[sub.status] || sub.status}` +
    (body ? `\n${body.slice(0, SUBAGENT_VIEW_MAX_CHARS)}` : "") +
    (sub.status === "completed"
      ? `\n（完整输出可用 get_command_or_subagent_output 或 agent_output 查询）`
      : "")
  );
}

export const getCommandOrSubagentOutputTool: ToolDefinition = {
  name: "get_command_or_subagent_output",
  kind: "read",
  description:
    "Checks output and status of a background command or asynchronous sub-agent task by task ID. Optionally waits up to timeout_ms for completion.",
  permission: "safe",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "Task ID (task_xxx for commands, task_sub_xxx for sub-agents)",
      },
      timeout_ms: { type: "number", description: "Optional milliseconds to wait for completion" },
    },
    required: ["task_id"],
  },
  async execute(args, ctx?: ToolExecContext) {
    const taskId = String(args.task_id ?? "").trim();
    const timeoutMs = Number(args.timeout_ms ?? 0) || undefined;
    if (!taskId) return "task_id 不能为空";

    // 后台 shell 命令由 BackgroundTaskManager 管理
    if (ctx?.backgroundTasks) {
      const task = await ctx.backgroundTasks.getOutput(taskId, timeoutMs);
      if (task) {
        const statusLabel: Record<string, string> = {
          running: "运行中",
          completed: "已完成",
          failed: "失败",
          killed: "已终止",
        };
        return (
          `[后台命令] ${task.taskId} | 状态: ${statusLabel[task.status] || task.status}` +
          (task.exitCode !== undefined && task.exitCode !== null
            ? ` | exit code: ${task.exitCode}`
            : "") +
          (task.output ? `\n${task.output.slice(0, 8000)}` : "")
        );
      }
    }

    // 子 Agent 任务由 SubAgentDelegator 管理 — timeout_ms 下真正等待完成
    if (ctx?.subAgents) {
      const [state] = await ctx.subAgents.waitForTasks([taskId], "all", timeoutMs ?? 0);
      if (state) return formatSubAgentView(state);
    }

    return `未找到任务 '${taskId}'（后台命令或子 Agent 任务均无此 ID）。`;
  },
};

export const waitCommandsOrSubagentsTool: ToolDefinition = {
  name: "wait_commands_or_subagents",
  kind: "read",
  description:
    "Waits for one or more background tasks (commands or sub-agents) to finish. mode=any returns on first completion; mode=all waits for every task.",
  permission: "safe",
  readOnly: true,
  // 等待子代理/后台命令可能远超普通工具 30s 上限 — 覆盖为 5 分钟
  timeoutMs: 300_000,
  parameters: {
    type: "object",
    properties: {
      task_ids: {
        type: "array",
        items: { type: "string" },
        description: "Task IDs to wait for (max 20)",
      },
      mode: {
        type: "string",
        enum: ["any", "all"],
        description: "wait_any returns on first completion; wait_all waits for every task",
      },
      timeout_ms: { type: "number", description: "Maximum milliseconds to wait (default 30000)" },
    },
    required: ["task_ids"],
  },
  async execute(args, ctx?: ToolExecContext) {
    const taskIds = (Array.isArray(args.task_ids) ? args.task_ids : []).map(String).slice(0, 20);
    if (taskIds.length === 0) return "task_ids 不能为空";
    const mode = args.mode === "all" ? "all" : "any";
    const timeoutMs = Number(args.timeout_ms ?? 30000) || 30000;

    const lines: string[] = [];

    // 划分：BackgroundTaskManager 管理的 shell 命令 vs SubAgentDelegator 管理的子代理
    const commandIds: string[] = [];
    const subAgentIds: string[] = [];
    for (const id of taskIds) {
      if (ctx?.backgroundTasks?.get(id)) commandIds.push(id);
      else subAgentIds.push(id);
    }

    // 两类任务并行等待，结果合并返回
    const [commandTasks, subAgentStates] = await Promise.all([
      commandIds.length > 0 && ctx?.backgroundTasks
        ? ctx.backgroundTasks.wait(commandIds, mode, timeoutMs)
        : Promise.resolve([]),
      subAgentIds.length > 0 && ctx?.subAgents
        ? ctx.subAgents.waitForTasks(subAgentIds, mode, timeoutMs)
        : Promise.resolve([]),
    ]);

    for (const t of commandTasks) {
      lines.push(
        `[后台命令] ${t.taskId} | ${t.status}${t.output ? ` | ${t.output.slice(0, 500)}` : ""}`
      );
    }
    for (const s of subAgentStates) {
      lines.push(formatSubAgentView(s));
    }
    for (const id of subAgentIds) {
      if (
        !subAgentStates.some(
          (s) => s.taskId === id || s.taskId.startsWith(id) || id.startsWith(s.taskId)
        )
      ) {
        lines.push(`任务 '${id}' 不存在`);
      }
    }
    if (lines.length === 0) {
      const running = subAgentStates.some((s) => s.status === "running");
      lines.push(
        running
          ? `(等待超时：${subAgentStates.length} 个子代理仍在运行，可用 check_subagent_status 再次查询)`
          : "(无任务结果)"
      );
    }
    return lines.length > 0 ? lines.join("\n\n") : "(无任务结果)";
  },
};

export const killCommandOrSubagentTool: ToolDefinition = {
  name: "kill_command_or_subagent",
  kind: "write",
  description:
    "Terminates a running background command task (SIGTERM then SIGKILL). Sub-agent tasks are read-only and cannot be killed.",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Task ID of the background command to kill" },
    },
    required: ["task_id"],
  },
  async execute(args, ctx?: ToolExecContext) {
    const taskId = String(args.task_id ?? "").trim();
    if (!taskId) return "task_id 不能为空";

    const task = ctx?.backgroundTasks?.get(taskId);
    if (!task) {
      if (ctx?.subAgents?.getTaskState(taskId)) {
        return "子 Agent 任务不支持 kill（只读委派任务）。请等待其完成或使用 check_subagent_status 查看进度。";
      }
      return `未找到任务 '${taskId}'。`;
    }
    if (task.status !== "running") {
      return `任务 '${taskId}' 当前状态为 ${task.status}，无需终止。`;
    }
    const killed = await ctx!.backgroundTasks!.kill(taskId);
    return killed
      ? `已发送终止信号（SIGTERM→SIGKILL）给后台任务 '${taskId}'。`
      : `终止任务 '${taskId}' 失败（可能已退出）。`;
  },
};
