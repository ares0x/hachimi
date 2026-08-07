// packages/core/src/tasks/task-registry.ts
//
// P1.7: Unified task registry — 子代理与后台任务的统一状态基座。
//
// 设计（Claude Code Task.ts / craft-agents-oss TaskRunner run-logs）：
//   - TaskStateBase 提供跨任务大类共享的最小状态面
//   - 子代理（SubAgentTaskState）与后台命令（BackgroundTask）都落到同一注册表，
//     UI/Activity 投影与恢复共享一条查询路径
//   - ID 前缀按大类区分（task_sub_ / bg_），互不冲突
//
// 迁移窗口：具体任务类型通过 `TaskStateBase & { 具体字段 }` 扩展基座，
// 不改变既有读写语义（状态字段原地保留）。

export type TaskKind = "subagent" | "background" | "goal" | "dag";

export type TaskStatus = "running" | "completed" | "failed" | "cancelled" | "killed";

/** 统一任务状态基座 */
export interface TaskStateBase {
  taskId: string;
  /** 任务大类（subagent | background） */
  taskKind: TaskKind;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  /** 输出文件（sidechain / 归档引用） */
  outputFile?: string;
  /** 是否已通知用户（桌面通知去重） */
  notified?: boolean;
  /** 失败原因（status === failed 时通常非空） */
  error?: string;
}

export type TaskState = TaskStateBase & Record<string, unknown>;

/**
 * 统一任务注册表：以 taskId 为键的 O(1) 状态存储。
 * 各任务管理器（SubAgentDelegator / BackgroundTaskManager）在生命周期
 * 关键点调用 registerTask / updateTaskState，UI 与恢复流程通过 listTasks 聚合查询。
 */
export class TaskRegistry {
  private tasks = new Map<string, TaskState>();

  registerTask<T extends TaskStateBase>(task: T): void {
    this.tasks.set(task.taskId, task as TaskState);
  }

  updateTaskState<T extends TaskStateBase>(
    taskId: string,
    patch: Partial<Omit<T, "taskId" | "createdAt">>
  ): T | undefined {
    const current = this.tasks.get(taskId);
    if (!current) return undefined;
    const next = { ...current, ...patch, updatedAt: Date.now() } as unknown as T;
    this.tasks.set(taskId, next as TaskState);
    return next;
  }

  getTask<T extends TaskStateBase = TaskStateBase>(taskId: string): T | undefined {
    return this.tasks.get(taskId) as T | undefined;
  }

  listTasks<T extends TaskStateBase = TaskStateBase>(taskKind?: TaskKind): T[] {
    const all = Array.from(this.tasks.values()) as T[];
    return taskKind ? all.filter((t) => t.taskKind === taskKind) : all;
  }

  deleteTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  clear(): void {
    this.tasks.clear();
  }
}
