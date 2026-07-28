import type { PathJail } from "../sandbox/path-jail.js";

/** 执行时由 Registry 注入，避免每个 tool 自己 new PathJail() */
export type ToolExecContext = {
  jail: PathJail;
  /** PathJail 工作区根，供 shell cwd 等 */
  workspaceRoot: string;
  /** 当前 session ID，工具可据此关联事件 */
  sessionId?: string;
  workId?: string;
  /**
   * W1.3: Work 管理器引用，内置工具 update_work_plan 通过此接口持久化 plan。
   * 类型故意宽松（避免对 WorkManager 的精确类型产生循环依赖或逆变冲突）。
   */
  workManager?: {
    updatePlan: (workId: any, steps: any[]) => any;
  };
  /** AbortSignal 接口预留（当前链路尚未完整接入，勿依赖） */
  signal?: AbortSignal;
};

export type ToolPermission = "safe" | "needs_confirm" | "dangerous";

export type ToolDefinition = {
  name: string;
  description: string;
  permission: ToolPermission;
  parameters: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    ctx?: ToolExecContext,
  ) => Promise<string>;
};
