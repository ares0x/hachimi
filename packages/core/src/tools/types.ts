import type { SubAgentDelegator } from "../agent/sub-agent.js";
import type { FileHistoryStore } from "../rewind/file-history.js";
import type { PathJail } from "../sandbox/path-jail.js";
import type { BackgroundTaskManager } from "../tasks/background-task-manager.js";
import type { SessionTrustLevel } from "./policy.js";

/**
 * 交互式审批回调（工具/子代理需要确认时的统一签名）。
 * - diff：文件编辑类工具由 harness 预检生成的 diff（可空）
 * - policyContext：审批时点可用的策略上下文（surface / trust / toolKind），
 *   供默认审批处理器做正确裁决；自定义 handler 可忽略。
 */
export type ToolApprovalHandler = (
  toolName: string,
  args: Record<string, unknown>,
  permission: string,
  diff?: string,
  policyContext?: {
    channel?: string;
    trustLevel?: SessionTrustLevel;
    toolKind?: string;
  }
) => Promise<boolean>;

/** P3: Semantic tool categories — enables grouped prompts and cross-dialect references */
export type ToolKind =
  | "read"
  | "write"
  | "delete"
  | "shell"
  | "calc"
  | "search"
  | "work"
  | "meta"
  | "other";

/** 执行时由 Registry 注入，避免每个 tool 自己 new PathJail() */
export type ToolExecContext = {
  jail: PathJail;
  /** PathJail 工作区根，供 shell cwd 等 */
  workspaceRoot: string;
  /**
   * 经过脱敏的子进程环境变量（敏感 API Key / Token 已被剥离）。
   * 工具派生子进程时应优先使用 ctx.env 而非直接透传 process.env。
   */
  env?: Record<string, string>;
  /** 当前 session ID，工具可据此关联事件 */
  sessionId?: string;
  workId?: string;
  /**
   * W1.3: Work 管理器引用，内置工具 update_work_plan 通过此接口持久化 plan。
   * 类型故意宽松（避免对 WorkManager 的精确类型产生循环依赖或逆变冲突）。
   */
  workManager?: {
    updatePlan: (workId: any, steps: any[]) => any;
    get?: (workId: any) => any;
  };
  /** AbortSignal 接口预留（当前链路尚未完整接入，勿依赖） */
  signal?: AbortSignal;
  /**
   * 结构化向用户提问的回调（由 TUI/Web 等交互面注入）。
   * 返回用户选择的选项文本；未注入或用户取消时返回 undefined。
   */
  onUserQuestion?: (question: string, options: string[]) => Promise<string | undefined>;
  /**
   * P0-2: 会话执行模式（normal | plan）的读写访问。
   * 由 HarnessRuntime 注入闭包（内部持有 SessionManager）。
   * enter_plan_mode / exit_plan_mode 工具通过此接口切换模式。
   */
  sessionMode?: {
    get: () => "normal" | "plan";
    set: (mode: "normal" | "plan") => void;
  };
  /** P0-3: 后台任务管理器（后台命令） */
  backgroundTasks?: BackgroundTaskManager;
  /** P0-3: 子 Agent 委派器（供统一任务查询/等待/终止工具使用） */
  subAgents?: SubAgentDelegator;
  /** 来源表面（PermissionPolicy 对齐），供委派类工具继承父级策略 */
  channel?: string;
  /** 会话信任级别（子代理继承父级，永不超出父级） */
  trustLevel?: SessionTrustLevel;
  /** 父级审批回调（子代理需要审批时升级到父会话的审批通道） */
  onToolApproval?: ToolApprovalHandler;
  /** P2.6: 文件历史快照存储（写工具执行前自动捕获 before 快照，供 /rewind 使用） */
  fileHistory?: FileHistoryStore;
};

export type ToolPermission = "safe" | "needs_confirm" | "dangerous";

export type ToolDefinition = {
  name: string;
  description: string;
  permission: ToolPermission;
  /** P3: Semantic category — enables grouped prompts and cross-tool references */
  kind?: ToolKind;
  /** P2-B3: 工具组（如 "browser" / "search" / "git"）；启用门控后未激活组不公布 */
  group?: string;
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
  /**
   * P1: Tool-level permission check (Claude Code pattern).
   * Runs after PermissionPolicy.decide() but before sandbox execution.
   * Tools can apply domain-specific rules (e.g., Bash checks sandbox status).
   */
  checkPermissions?: (
    args: Record<string, unknown>,
    ctx?: { surface?: string; sessionId?: string }
  ) => { allowed: boolean; reason?: string };
  /**
   * P2: When true, successfully executing this tool signals the agent loop to
   * stop immediately (Pi's `terminate` pattern). Used for completion tools
   * like `complete_task` — the agent says "I'm done" by calling this tool.
   */
  terminatesSession?: boolean;
  /**
   * Sandbox execution timeout in ms. Overrides the global 30s default — for
   * nested-execution tools (e.g. delegate_subagent) whose real run may take
   * far longer than a plain tool.
   */
  timeoutMs?: number;
  /** P1: 结构化渲染器，将工具原始输出转换为 UI 极简摘要 */
  renderToolResultMessage?: (result: unknown) => string;
  execute: (args: Record<string, unknown>, ctx?: ToolExecContext) => Promise<string>;
};
