// packages/core/src/tools/registry.ts
import { CIRCUIT_BREAKER_MAX_FAILURES, formatCircuitBreakerOpenMessage } from "@hachimi/shared";
import type { HookRegistry } from "../extensions/hooks.js";
import { PathJail } from "../sandbox/path-jail.js";
import { ToolSandbox } from "../sandbox/sandbox.js";
import type { ChannelType, ToolDefinition, ToolPermission } from "../types/index.js";
import { defaultPermissionPolicy, type PermissionPolicy, type SurfaceType } from "./policy.js";
import type { ToolExecContext as _ToolExecContext } from "./types.js";

/**
 * Registry 内部扩展版 ToolExecContext：继承规范类型，增加 index signature
 * 允许 buildExecContext() 将 options.context 的任意字段透传给工具
 */
export type ToolExecContext = _ToolExecContext & { [key: string]: unknown };

import type { Work } from "../types/work.js";

export interface ToolExecuteOptions {
  /** UI/调用方已显式确认 */
  confirm?: boolean;
  /** 旧透传字段，会与 jail 上下文合并 */
  context?: Record<string, unknown>;
  hooks?: HookRegistry;
  sessionId?: string;
  workManager?: ToolExecContext["workManager"];
  workId?: string;
  work?: Work;
  /**
   * 来源表面（与 PermissionPolicy 的 surface 对齐）
   * 如 tui | web | desktop | telegram | api | cli …
   */
  channel?: ChannelType | SurfaceType | string;
  /** 覆盖本次工作区根 */
  workspaceRoot?: string;
  /** 覆盖本次策略实例；默认用 Registry 持有的 policy */
  permissionPolicy?: PermissionPolicy;
  onToolApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    permission: string
  ) => Promise<boolean>;
  /** P2: 工具执行成功且 terminatesSession 时回调 */
  onSessionTerminate?: (toolName: string) => void;
}

export type ToolRegistryOptions = {
  workspaceRoot?: string;
  allowOutsideWorkspace?: boolean;
  permissionPolicy?: PermissionPolicy;
  sandbox?: ToolSandbox;
  maxConsecutiveFailures?: number;
};

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private sandbox: ToolSandbox;
  private failureCounts: Map<string, number> = new Map();
  /** P1: Loop-gate — track consecutive failures with identical args (Maka pattern) */
  private lastFailedArgs: Map<string, string> = new Map();
  private identicalFailures: Map<string, number> = new Map();
  private readonly LOOP_GATE_THRESHOLD = 3;
  private maxConsecutiveFailures: number;
  private workspaceRoot: string;
  private allowOutsideWorkspace: boolean;
  private permissionPolicy: PermissionPolicy;

  constructor(options: ToolRegistryOptions = {}) {
    this.sandbox = options.sandbox ?? new ToolSandbox();
    this.maxConsecutiveFailures = options.maxConsecutiveFailures ?? CIRCUIT_BREAKER_MAX_FAILURES;
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.allowOutsideWorkspace = options.allowOutsideWorkspace ?? false;
    this.permissionPolicy = options.permissionPolicy ?? defaultPermissionPolicy;
  }

  setWorkspaceRoot(root: string, allowOutsideWorkspace = false): void {
    this.workspaceRoot = root;
    this.allowOutsideWorkspace = allowOutsideWorkspace;
  }

  setPermissionPolicy(policy: PermissionPolicy): void {
    this.permissionPolicy = policy;
  }

  getPermissionPolicy(): PermissionPolicy {
    return this.permissionPolicy;
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  resetCircuitBreaker(name: string): void {
    this.failureCounts.set(name, 0);
    this.identicalFailures.delete(name);
    this.lastFailedArgs.delete(name);
  }

  resetAllCircuitBreakers(): void {
    this.failureCounts.clear();
  }

  getFailureCount(name: string): number {
    return this.failureCounts.get(name) || 0;
  }

  private recordFailure(name: string): void {
    this.failureCounts.set(name, this.getFailureCount(name) + 1);
  }

  private buildExecContext(options?: ToolExecuteOptions): ToolExecContext {
    const workspaceRoot = options?.workspaceRoot ?? this.workspaceRoot;
    const jail = new PathJail({
      workspaceRoot,
      allowOutsideWorkspace: this.allowOutsideWorkspace,
    });

    const base = (options?.context ?? {}) as Record<string, unknown>;

    return {
      ...base,
      jail,
      workspaceRoot: jail.getWorkspaceRoot(),
      sessionId: options?.sessionId ?? (base.sessionId as string | undefined),
      workId: options?.workId ?? (base.workId as string | undefined),
      workManager: options?.workManager ?? (base.workManager as ToolExecContext["workManager"]),
    };
  }

  /**
   * 统一工具执行管道
   * 1. 工具存在性
   * 2. 熔断器
   * 3. 必填参数
   * 4. PermissionPolicy.decide → allow | require_approval | deny
   * 5. PreToolCall Hook
   * 6. 沙箱执行
   * 7. 熔断计数 + PostToolCall Hook
   */
  async execute(
    name: string,
    rawArgs: Record<string, unknown>,
    options?: ToolExecuteOptions
  ): Promise<string> {
    const startTime = Date.now();
    const tool = this.tools.get(name);
    if (!tool) {
      return `未知工具: ${name}`;
    }

    // 1) 熔断
    const currentFailures = this.getFailureCount(name);
    if (currentFailures >= this.maxConsecutiveFailures) {
      return formatCircuitBreakerOpenMessage(name, currentFailures);
    }

    // 1.5) P1: Loop-gate — block identical args retried after consecutive failures (Maka pattern)
    const argsKey = JSON.stringify(rawArgs);
    if (this.lastFailedArgs.get(name) === argsKey) {
      const streak = (this.identicalFailures.get(name) || 0) + 1;
      this.identicalFailures.set(name, streak);
      if (streak >= this.LOOP_GATE_THRESHOLD) {
        this.identicalFailures.delete(name);
        this.lastFailedArgs.delete(name);
        return `[Loop-gate] 工具 ${name} 已使用相同参数连续失败 ${streak} 次。请换一种方式或使用不同的参数，不要再重复相同的调用。`;
      }
    } else {
      this.identicalFailures.set(name, 1);
      this.lastFailedArgs.set(name, argsKey);
    }

    // 2) 必填参数
    let args: Record<string, unknown> = { ...rawArgs };
    const required = tool.parameters?.required;
    if (Array.isArray(required)) {
      const missingKeys = (required as string[]).filter(
        (key) => args[key] === undefined || args[key] === null
      );
      if (missingKeys.length > 0) {
        this.recordFailure(name);
        return `[参数校验错误] 工具 ${name} 缺失必填参数: ${missingKeys.join(", ")}`;
      }
    }

    // 3) 权限策略 (W5.5.3: 【双重判定契约 - 第二层 (ToolRegistry 安全闸口)】
    // 此阶段为底层的安全兜底防护，针对直接调用 execute() 或外部 API 输入的防线。
    // 第一层 Agent.run() 已根据此处的相同规则决定了是否进行 confirm 询问。)
    const level = (tool.permission ?? "safe") as ToolPermission;
    const surface = (options?.channel ?? "api") as SurfaceType;
    const policy = options?.permissionPolicy ?? this.permissionPolicy;
    const decision = policy.decide(surface, name, level);

    if (decision === "deny") {
      return `策略拒绝工具: ${name} (surface=${surface}, permission=${level})`;
    }

    if (decision === "require_approval") {
      let isApproved = Boolean(options?.confirm);

      if (!isApproved && options?.onToolApproval) {
        try {
          isApproved = await options.onToolApproval(name, args, level);
        } catch {
          isApproved = false;
        }
      }

      if (!isApproved) {
        return `需要确认才能执行工具: ${name} (${level})。用户拒绝或未经授权。`;
      }
    }
    // decision === "allow"：直接进入执行

    // 3.5) Preflight Gate: 输入参数校验 (validateInput)
    if (tool.validateInput) {
      const valRes = tool.validateInput(args);
      if (!valRes.valid) {
        return `[Preflight Check Failed] Tool '${name}' validation failed: ${valRes.reason || "Invalid input parameters"}`;
      }
    }

    // 3.6) P1: Tool-level checkPermissions (Claude Code pattern)
    // Runs after PermissionPolicy but before execution.
    // Tools apply domain-specific rules — e.g. Bash checks sandbox status.
    if (tool.checkPermissions) {
      const permResult = tool.checkPermissions(args, {
        surface: options?.channel,
        sessionId: options?.sessionId,
      });
      if (!permResult.allowed) {
        return `[权限被拒绝] ${name}: ${permResult.reason || "Tool-level permission check failed"}`;
      }
    }

    // 4) PreToolCall
    if (options?.hooks) {
      const preResult = await options.hooks.runPreToolCall({
        toolName: name,
        args,
        sessionId: options.sessionId,
      });

      if (preResult.action === "block") {
        return preResult.reason || `[Hook 拦截] 工具 ${name} 被生命周期钩子阻止执行。`;
      }
      if (preResult.modifiedArgs) {
        args = { ...preResult.modifiedArgs };
      }
    }

    // 5) 沙箱执行（注入 PathJail 等 ctx）
    const execCtx = this.buildExecContext(options);
    let rawResult = "";
    let success = true;

    try {
      rawResult = await this.sandbox.executeToolInSandbox(name, () => tool.execute(args, execCtx), {
        timeoutMs: 30_000,
        args,
        workspaceRoot: options?.work?.workspaceRoot,
      });

      if (
        typeof rawResult === "string" &&
        (rawResult.startsWith("[沙箱拦截]") ||
          rawResult.startsWith("[沙箱熔断]") ||
          rawResult.startsWith("Error executing tool"))
      ) {
        success = false;
      }
    } catch (err: unknown) {
      success = false;
      const message = err instanceof Error ? err.message : String(err);
      rawResult = `Error executing tool ${name}: ${message}`;
    }

    if (success) {
      this.failureCounts.set(name, 0);
      this.identicalFailures.delete(name); // P1: reset loop-gate on success

      // P2: Signal session termination if tool declares terminatesSession
      if (tool.terminatesSession && options?.onSessionTerminate) {
        options.onSessionTerminate(name);
      }
    } else {
      this.recordFailure(name);
    }

    // 6) PostToolCall
    const durationMs = Date.now() - startTime;
    let finalResult = rawResult;

    if (options?.hooks) {
      const postResult = await options.hooks.runPostToolCall({
        toolName: name,
        args,
        result: rawResult,
        durationMs,
        success,
      });
      if (postResult.modifiedResult !== undefined) {
        finalResult = postResult.modifiedResult;
      }
    }

    return finalResult;
  }
}
