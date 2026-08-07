// packages/core/src/tools/registry.ts
import {
  CIRCUIT_BREAKER_MAX_FAILURES,
  formatCircuitBreakerOpenMessage,
  formatLongRunningTimeoutHint,
} from "@hachimi/shared";
import type { HookRegistry } from "../extensions/hooks.js";
import { PathJail } from "../sandbox/path-jail.js";
import { ToolSandbox } from "../sandbox/sandbox.js";
import type { ChannelType, ToolDefinition, ToolPermission } from "../types/index.js";
import type { GrantStore } from "./grant-store.js";
import {
  defaultPermissionPolicy,
  type PermissionPolicy,
  type SessionTrustLevel,
  type SurfaceType,
} from "./policy.js";
import { PermissionRuleEngine } from "./rule-engine.js";
import type { ToolExecContext as _ToolExecContext, ToolApprovalHandler } from "./types.js";

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
  knowledgeRoot?: string;
  knowledgeWriteRoot?: string;
  /** 覆盖本次策略实例；默认用 Registry 持有的 policy */
  permissionPolicy?: PermissionPolicy;
  /**
   * Session-scoped trust level — overrides the surface default when set.
   * Injected by HarnessRuntime based on channel, user preference, or
   * mid-session /trust elevation commands.
   */
  trustLevel?: SessionTrustLevel;
  /** Optional cancellation signal */
  signal?: AbortSignal;
  onToolApproval?: ToolApprovalHandler;
  /** 结构化向用户提问的回调（透传给工具 ctx.onUserQuestion） */
  onUserQuestion?: (question: string, options: string[]) => Promise<string | undefined>;
  /** P2: 工具执行成功且 terminatesSession 时回调 */
  onSessionTerminate?: (toolName: string) => void;
  /** P0-2: 当前会话是否处于计划模式（只读探索 + 计划编写） */
  planMode?: boolean;
  /** P0-2: 会话模式读写访问（供 enter/exit_plan_mode 使用） */
  sessionMode?: ToolExecContext["sessionMode"];
  /** P0-3: 后台任务管理器（后台命令任务） */
  backgroundTasks?: ToolExecContext["backgroundTasks"];
  /** P0-3: 子 Agent 委派器（统一任务查询/等待/终止工具） */
  subAgents?: ToolExecContext["subAgents"];
}

export type ToolRegistryOptions = {
  workspaceRoot?: string;
  allowOutsideWorkspace?: boolean;
  permissionPolicy?: PermissionPolicy;
  sandbox?: ToolSandbox;
  maxConsecutiveFailures?: number;
  /** P0-4: 记忆授权存储（项目级命令授权记忆） */
  grantStore?: GrantStore;
  /** P0-4: 权限规则引擎（deny/ask/allow + 危险命令） */
  ruleEngine?: PermissionRuleEngine;
};

/**
 * P1.5: 工具注册层级（优先级 builtin > extension > mcp）。
 * 低优先级层不能覆盖/注销高优先级层，防止 MCP 同步静默遮蔽内置工具。
 */
export type ToolLayer = "builtin" | "extension" | "mcp";

const TOOL_LAYER_PRIORITY: Record<ToolLayer, number> = {
  builtin: 3,
  extension: 2,
  mcp: 1,
};

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  /** P1.5: 每个工具名所属注册层级 */
  private toolLayers: Map<string, ToolLayer> = new Map();
  private sandbox: ToolSandbox;
  private failureCounts: Map<string, number> = new Map();
  /** P2-B3: 工具门控 — 启用后仅公布未分组工具与已激活分组的工具 */
  private toolGatingEnabled = false;
  private activatedGroups: Set<string> = new Set();
  private gatingDefaultGroups: string[] = [];
  /** P1: Loop-gate — track consecutive failures with identical args (Maka pattern) */
  private lastFailedArgs: Map<string, string> = new Map();
  private identicalFailures: Map<string, number> = new Map();
  private readonly LOOP_GATE_THRESHOLD = 3;
  private maxConsecutiveFailures: number;
  private workspaceRoot: string;
  private grantStore?: GrantStore;
  private ruleEngine: PermissionRuleEngine;

  /** P0-2: 计划模式下仍然允许的工具（读操作之外的计划/提问工具） */
  private static readonly PLAN_MODE_ALLOWED_TOOLS = new Set([
    "enter_plan_mode",
    "exit_plan_mode",
    "update_work_plan",
    "ask_user_question",
    "todo_write",
    "tool_search",
    "save_memory",
  ]);
  private knowledgeRoot?: string;
  private knowledgeWriteRoot?: string;
  private allowOutsideWorkspace: boolean;
  private permissionPolicy: PermissionPolicy;

  constructor(
    options: ToolRegistryOptions & { knowledgeRoot?: string; knowledgeWriteRoot?: string } = {}
  ) {
    this.sandbox = options.sandbox ?? new ToolSandbox();
    this.maxConsecutiveFailures = options.maxConsecutiveFailures ?? CIRCUIT_BREAKER_MAX_FAILURES;
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.knowledgeRoot = options.knowledgeRoot;
    this.knowledgeWriteRoot = options.knowledgeWriteRoot;
    this.allowOutsideWorkspace = options.allowOutsideWorkspace ?? false;
    this.permissionPolicy = options.permissionPolicy ?? defaultPermissionPolicy;
    this.grantStore = options.grantStore;
    this.ruleEngine = options.ruleEngine ?? new PermissionRuleEngine();
  }

  /** P0-4: 权限规则引擎（配置热更新 / 查询用） */
  getRuleEngine(): PermissionRuleEngine {
    return this.ruleEngine;
  }

  getGrantStore(): GrantStore | undefined {
    return this.grantStore;
  }

  setWorkspaceRoot(root: string, allowOutsideWorkspace = false): void {
    this.workspaceRoot = root;
    this.allowOutsideWorkspace = allowOutsideWorkspace;
  }

  setKnowledgeRoots(knowledgeRoot?: string, knowledgeWriteRoot?: string): void {
    this.knowledgeRoot = knowledgeRoot;
    this.knowledgeWriteRoot = knowledgeWriteRoot;
  }

  setPermissionPolicy(policy: PermissionPolicy): void {
    this.permissionPolicy = policy;
  }

  getPermissionPolicy(): PermissionPolicy {
    return this.permissionPolicy;
  }

  register(tool: ToolDefinition, layer: ToolLayer = "extension"): void {
    const existingLayer = this.toolLayers.get(tool.name);
    if (
      existingLayer &&
      existingLayer !== layer &&
      TOOL_LAYER_PRIORITY[existingLayer] >= TOOL_LAYER_PRIORITY[layer]
    ) {
      console.warn(
        `[ToolRegistry] Skip registering '${tool.name}' at layer '${layer}': already registered at higher-priority layer '${existingLayer}'`
      );
      return;
    }
    this.tools.set(tool.name, tool);
    this.toolLayers.set(tool.name, layer);
  }

  unregister(name: string, layer?: ToolLayer): void {
    if (layer) {
      const existingLayer = this.toolLayers.get(name);
      // 低优先级层不能注销高优先级层（如 MCP removeServer 不能移除同名内置工具）
      if (
        existingLayer &&
        existingLayer !== layer &&
        TOOL_LAYER_PRIORITY[existingLayer] > TOOL_LAYER_PRIORITY[layer]
      ) {
        console.warn(
          `[ToolRegistry] Skip unregistering '${name}' from layer '${layer}': owned by higher-priority layer '${existingLayer}'`
        );
        return;
      }
    }
    this.tools.delete(name);
    this.toolLayers.delete(name);
  }

  /** P1.5: 查询工具所属注册层级（调试/审计用） */
  getLayer(name: string): ToolLayer | undefined {
    return this.toolLayers.get(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    const all = Array.from(this.tools.values());
    if (!this.toolGatingEnabled) return all;
    return all.filter(
      (t) => !t.group || this.activatedGroups.has(t.group) || t.name === "load_tools"
    );
  }

  listTools(): ToolDefinition[] {
    return this.list();
  }

  // ─── P2-B3: Tool gating (load_tools) ───────────────────────────────────────

  /** 启用/停用工具门控；启用时按 defaultGroups 预激活分组 */
  setToolGating(enabled: boolean, defaultGroups: string[] = []): void {
    this.toolGatingEnabled = enabled;
    this.activatedGroups.clear();
    this.gatingDefaultGroups = enabled ? [...defaultGroups] : [];
    for (const g of this.gatingDefaultGroups) this.activatedGroups.add(g);
  }

  isToolGatingEnabled(): boolean {
    return this.toolGatingEnabled;
  }

  /**
   * 激活一个工具组，返回本次新公布的工具名列表。
   * 未知分组返回空数组（幂等，重复激活不报错）。
   */
  loadToolGroup(group: string): string[] {
    const normalized = group.trim();
    if (!normalized) return [];

    const knownGroups = new Set(
      Array.from(this.tools.values())
        .map((t) => t.group)
        .filter((g): g is string => Boolean(g))
    );
    if (!knownGroups.has(normalized)) return [];

    const before = new Set(this.list().map((t) => t.name));
    this.activatedGroups.add(normalized);
    const after = new Set(this.list().map((t) => t.name));
    return Array.from(after).filter((name) => !before.has(name));
  }

  getActivatedGroups(): string[] {
    return Array.from(this.activatedGroups);
  }

  /** 分组目录（供 load_tools 工具返回给模型，帮助其发现可激活组） */
  listGroups(): Array<{ name: string; tools: string[]; activated: boolean }> {
    const groups = new Map<string, string[]>();
    for (const t of this.tools.values()) {
      if (!t.group) continue;
      const list = groups.get(t.group) ?? [];
      list.push(t.name);
      groups.set(t.group, list);
    }
    return Array.from(groups.entries()).map(([name, tools]) => ({
      name,
      tools,
      activated: this.activatedGroups.has(name),
    }));
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

  private buildExecContext(
    options?: ToolExecuteOptions,
    signalOverride?: AbortSignal
  ): ToolExecContext {
    const workspaceRoot =
      options?.workspaceRoot ?? options?.work?.workspaceRoot ?? this.workspaceRoot;
    const knowledgeRoot = options?.knowledgeRoot ?? this.knowledgeRoot;
    const knowledgeWriteRoot = options?.knowledgeWriteRoot ?? this.knowledgeWriteRoot;

    const jail = new PathJail({
      workspaceRoot,
      knowledgeRoot,
      knowledgeWriteRoot,
      allowOutsideWorkspace: this.allowOutsideWorkspace,
    });

    const base = (options?.context ?? {}) as Record<string, unknown>;

    return {
      ...base,
      jail,
      workspaceRoot: jail.getWorkspaceRoot(),
      env: ToolSandbox.scrubEnv(process.env),
      sessionId: options?.sessionId ?? (base.sessionId as string | undefined),
      workId: options?.workId ?? (base.workId as string | undefined),
      workManager: options?.workManager ?? (base.workManager as ToolExecContext["workManager"]),
      signal: signalOverride ?? options?.signal ?? (base.signal as AbortSignal | undefined),
      onUserQuestion:
        options?.onUserQuestion ?? (base.onUserQuestion as ToolExecContext["onUserQuestion"]),
      sessionMode: options?.sessionMode ?? (base.sessionMode as ToolExecContext["sessionMode"]),
      backgroundTasks:
        options?.backgroundTasks ?? (base.backgroundTasks as ToolExecContext["backgroundTasks"]),
      subAgents: options?.subAgents ?? (base.subAgents as ToolExecContext["subAgents"]),
      channel: options?.channel ?? (base.channel as string | undefined),
      trustLevel: options?.trustLevel ?? (base.trustLevel as SessionTrustLevel | undefined),
      onToolApproval:
        options?.onToolApproval ?? (base.onToolApproval as ToolApprovalHandler | undefined),
    };
  }

  /** P0-2: 计划模式放行判定 — 只读工具 + 计划/提问工具 */
  private isPlanModeAllowed(name: string, tool: ToolDefinition): boolean {
    if (ToolRegistry.PLAN_MODE_ALLOWED_TOOLS.has(name)) return true;
    return tool.readOnly === true;
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

    // P2-B3: 工具门控守卫 — 未激活分组的工具即使被模型直接调用也拒绝执行
    if (this.toolGatingEnabled && name !== "load_tools" && tool.group) {
      if (!this.activatedGroups.has(tool.group)) {
        return (
          `[工具门控] 工具 '${name}' 属于未激活的工具组 '${tool.group}'。` +
          `请先调用 load_tools 激活该组（可用组: ${this.listGroups()
            .map((g) => g.name)
            .join(", ")}）。`
        );
      }
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

    // 1.75) P0-2: Plan Mode Guard — 计划模式下仅放行只读/计划/提问工具
    if (options?.planMode && !this.isPlanModeAllowed(name, tool)) {
      return (
        `[Plan Mode] 计划模式下禁止执行工具 ${name}（仅允许只读工具、计划编写与用户提问）。` +
        `请先用 update_work_plan 编写计划，再调用 exit_plan_mode 提交计划等待批准后继续。`
      );
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

    // 3) Permission policy — dual-gate contract (second gate / safety net)
    // First gate runs in Agent.executeOneTool(); this catches direct execute() calls
    // from external surfaces that bypass the agent loop.
    const level = (tool.permission ?? "safe") as ToolPermission;
    const surface = (options?.channel ?? "api") as SurfaceType;
    const policy = options?.permissionPolicy ?? this.permissionPolicy;
    const trustLevel = options?.trustLevel;
    const workspaceRoot =
      options?.workspaceRoot ?? options?.work?.workspaceRoot ?? this.workspaceRoot;
    let decision = policy.decide(surface, name, level, trustLevel, tool.kind);

    // P0-4: 配置规则（deny > ask > allow）覆盖模式策略
    const ruleDecision = this.ruleEngine.evaluate(name);
    if (ruleDecision === "deny") {
      return `[权限规则] 工具 ${name} 被 permissionRules.deny 拒绝。`;
    }
    if (ruleDecision === "ask") {
      decision = "require_approval";
    } else if (ruleDecision === "allow") {
      decision = "allow";
    }

    // P0-4: 记忆授权 — 同项目内批准过的命令前缀自动放行（危险命令除外）
    if (decision === "require_approval" && name === "run_command" && this.grantStore) {
      const command = String(args.command ?? "");
      if (command && !this.ruleEngine.isDangerousCommand(command)) {
        const grant = this.grantStore.find(workspaceRoot, name, command);
        if (grant) decision = "allow";
      }
    }

    if (decision === "deny") {
      return `策略拒绝工具: ${name} (surface=${surface}, permission=${level})`;
    }

    if (decision === "require_approval") {
      let isApproved = Boolean(options?.confirm);

      if (!isApproved && options?.onToolApproval) {
        try {
          isApproved = await options.onToolApproval(name, args, level, undefined, {
            channel: surface,
            trustLevel,
            toolKind: this.tools.get(name)?.kind,
          });
        } catch {
          isApproved = false;
        }
      }

      if (!isApproved) {
        return `需要确认才能执行工具: ${name} (${level})。用户拒绝或未经授权。`;
      }

      // P0-4: 用户批准后，为 run_command 记录项目级记忆授权（危险命令不记忆）
      if (name === "run_command" && this.grantStore) {
        const command = String(args.command ?? "");
        if (command && !this.ruleEngine.isDangerousCommand(command)) {
          this.grantStore.add(workspaceRoot, name, command);
        }
      }
    }
    // decision === "allow": proceed directly

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
    // 每次调用独立 AbortController：沙箱超时 → abort 该工具的 signal，
    // 使嵌套执行（子代理 run / shell 子进程）真正中止，而不是成为孤儿继续空耗。
    const toolAbort = new AbortController();
    const execSignal = options?.signal
      ? AbortSignal.any([options.signal, toolAbort.signal])
      : toolAbort.signal;
    const execCtx = this.buildExecContext(options, execSignal);
    let rawResult = "";
    let success = true;

    try {
      rawResult = await this.sandbox.executeToolInSandbox(name, () => tool.execute(args, execCtx), {
        timeoutMs: tool.timeoutMs ?? 30_000,
        onTimeout: () => toolAbort.abort(),
        args,
        workspaceRoot: options?.workspaceRoot ?? options?.work?.workspaceRoot,
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

    // 长耗时编排工具（显式设置了 timeoutMs）超时后，其内部任务状态可能仍在后台更新 —
    // 附上恢复指引，让模型用状态查询工具找回结果而不是盲目重做。
    if (
      tool.timeoutMs !== undefined &&
      (rawResult.includes("[沙箱熔断]") || rawResult.includes("[Sandbox Timeout]"))
    ) {
      rawResult = `${rawResult}\n\n${formatLongRunningTimeoutHint()}`;
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
