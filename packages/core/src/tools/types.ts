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
  /** H3.4: 是否为无副作用的只读工具 */
  readOnly?: boolean;
  /** H3.4: 是否为重复执行幂等的工具 */
  isIdempotent?: boolean;
  /**
   * P1: 是否可以与其他工具并发执行。
   * 仅对 readOnly 工具默认为 true；write/delete/dangerous 工具默认为 false。
   * Agent 循环的 tool batching 依赖此字段进行动态分批。
   */
  isConcurrencySafe?: boolean;
  /** P1: 是否为破坏性/高危工具（如强制删除、改写主配置），触发双重安全确认 */
  isDestructive?: boolean;
  /** P1: 工具入参前置校验机制，在沙箱执行前由 Preflight Gate 预检 */
  validateInput?: (args: Record<string, unknown>) => { valid: boolean; reason?: string };
  /** P1: 结构化渲染器，将工具原始输出转换为 UI 极简摘要 */
  renderToolResultMessage?: (result: unknown) => string;
  execute: (args: Record<string, unknown>, ctx?: ToolExecContext) => Promise<string>;
};
