import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { resolveLlmSelection } from "@hachimi/config";
import {
  defaultTokenEstimator,
  generateId,
  i18n,
  log,
  type NormalizedUsage,
  sumUsage,
} from "@hachimi/shared";
import type { Agent } from "../agent/agent.js";
import { SubAgentDelegator } from "../agent/sub-agent.js";
import type { IEventStore } from "../events/event-store.js";
import type { HookRegistry } from "../extensions/hooks.js";
import type { McpClientManager } from "../extensions/mcp-client.js";
import type { SkillPackageLoader } from "../extensions/skill-package.js";
import { GoalRunner } from "../goal/goal-runner.js";
import { KnowledgeDistiller } from "../knowledge/distiller.js";
import type { MemoryManager } from "../memory/manager.js";
import { exportBundle } from "../portable/exporter.js";
import { importBundle } from "../portable/importer.js";
import type {
  ExportBundleOptions,
  HachimiBundleV1,
  ImportBundleOptions,
  ImportBundleResult,
} from "../portable/types.js";
import type { ProjectManager } from "../project/manager.js";
import type { FileHistoryStore, SnapshotChain } from "../rewind/file-history.js";
import { AgentRunStore } from "../run/agent-run-store.js";
import type { SessionManager } from "../session/manager.js";
import type { SessionRecoveryReport } from "../session/recovery.js";
import { recoverSession } from "../session/recovery.js";
import type { SkillRegistry } from "../skills/registry.js";
import { DagRunner } from "../tasks/dag-runner.js";
import { generateFileDiff } from "../tools/builtin/fs/diff.js";
import type { SessionTrustLevel, SurfaceType } from "../tools/policy.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ChannelType, RuntimeAttachment, Session } from "../types/index.js";
import type { WorkManager } from "../work/work-manager.js";
import type { AppContext, CreateAppContextOptions } from "./context.js";
import { createAppContext } from "./context.js";

export interface RuntimeInputOptions {
  onChunk?: (chunk: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>, toolCallId?: string) => void;
  onToolEnd?: (
    name: string,
    result: string,
    durationMs: number,
    success: boolean,
    toolCallId?: string,
    artifactRef?: string
  ) => void;
  onThinking?: (reasoningContent: string, durationMs?: number) => void;
  onIntermediateMessage?: (content: string) => void;
  onToolApproval?: import("../tools/types.js").ToolApprovalHandler;
  /** 审批请求前回调 — 可观察到预检 diff（D7），返回 { diff } 供 agent 透传 */
  onApprovalRequested?: (info: {
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    permission: string;
    diff?: string;
  }) => void | Promise<void>;
  /**
   * per-call surface 覆盖；通常由 RuntimeInput.channel 自动注入，无需手动设置
   */
  channel?: SurfaceType | ChannelType;
  /**
   * 视觉协助调用回调（SSE 等 channel 实时展示「正在用视觉模型看图」状态）
   */
  onVisionCompanionCall?: (info: { model: string; imageCount: number; cacheHits: number }) => void;
  /**
   * H3.5: 子 Agent 派生或单次调用的最大轮次限制
   */
  maxRounds?: number;
  /**
   * H3.5: 单次 run 的派生预算（子 Agent 派发额度）。
   * 累计该 run 内所有 LLM 调用的 token / 费用，超出任一上限即优雅收尾返回部分摘要。
   */
  usageBudget?: {
    maxTokens?: number;
    maxCostUSD?: number;
  };
  /** P2: 能力面过滤 — 仅允许列出的工具（子 Agent 角色化只读面） */
  allowedTools?: string[];
  /**
   * P2-3: 本次 run 的思考强度（子代理默认 "none" 关闭 thinking 控成本）。
   * 显式值优先级高于 autoModelRouting 的 proReasoningEffort 路由结果。
   */
  reasoningEffort?: "none" | "low" | "medium" | "high";
  /** AbortSignal for canceling ongoing execution */
  signal?: AbortSignal;
  /**
   * 无痕模式：本 Work 不写入任何记忆。
   * 默认从 Work.metadata.incognito 读取；显式传入时以此为准。
   */
  incognito?: boolean;
}

/** 单张图片附件写入事件的 base64 长度上限（约 2.25MB 原始数据）。 */
const MAX_ATTACHMENT_BASE64_CHARS = 3_000_000;

export interface RuntimeInput {
  prompt: string;
  sessionId?: string;
  /**
   * 用户附带的图片附件（"模型的眼睛"）。转为 image_url ContentPart 后，
   * 由视觉协助（vision companion）为无多模态能力的主模型生成文字描述。
   */
  attachments?: RuntimeAttachment[];
  /** 本次执行使用的项目工作区根（会写入对应 Work，并让 PathJail 跟随该项目根） */
  workspaceRoot?: string;
  channel?: SurfaceType | ChannelType;
  providerOverride?: string;
  /**
   * Explicit session trust level override.
   * If not set, HarnessRuntime infers from channel:
   *   tui / desktop / cli → "standard"
   *   telegram / proactive-trigger / unknown → "minimal"
   * Callers can pass "elevated" or "full" for trusted contexts.
   */
  trustLevel?: SessionTrustLevel;
  /** Optional cancellation signal */
  signal?: AbortSignal;
  options?: RuntimeInputOptions;
  metadata?: Record<string, unknown>;
}

export interface RuntimeOutput {
  sessionId: string;
  content: string;
  durationMs: number;
  channel?: string;
  statusRatio?: string;
  isError?: boolean;
  /** H3.6: 归一化 Token Usage 与 $ 美金开销 */
  usage?: NormalizedUsage & { costUsd?: number };
  errorDetail?: string;
}

/**
 * Unified Core Harness Runtime Orchestrator (HarnessRuntime)
 * Consolidates Agent loops, context assembly, tool execution, memory updates, hooks, and error boundaries
 */
export class HarnessRuntime {
  public readonly context: AppContext;
  public readonly memory: MemoryManager;
  public readonly tools: ToolRegistry;
  public readonly skills: SkillRegistry;
  public readonly sessions: SessionManager;
  public readonly agent: Agent;
  public readonly hooks: HookRegistry;
  public readonly mcp: McpClientManager;
  public readonly skillLoader: SkillPackageLoader;
  public readonly subAgentDelegator: SubAgentDelegator;
  /** W0: Append-only event store */
  public readonly events: IEventStore;
  /** W1: Work manager */
  public readonly works: WorkManager;
  /** V1.2: 项目管理器（绑定目录的项目集合实体） */
  public readonly projects: ProjectManager;
  /** V1.3: 记忆→知识提纯（后台、非阻塞、频率门控） */
  public readonly distiller: KnowledgeDistiller;
  /** Run: Durable run ledger for crash recovery */
  public readonly runs: AgentRunStore;
  /** P2.6: 文件历史快照存储（/rewind 数据载体） */
  public readonly fileHistory: FileHistoryStore;
  /** P2.1: Goal 模式编排器（planning → acting → verifying + 质疑者验证） */
  public readonly goals: GoalRunner;
  /** P2.2: DAG 任务编排器（拓扑调度 + 输出插值 + run-log） */
  public readonly dag: DagRunner;

  constructor(options: CreateAppContextOptions | AppContext = {}) {
    if ("memory" in options && "agent" in options) {
      this.context = options as AppContext;
    } else {
      this.context = createAppContext(options as CreateAppContextOptions);
    }

    this.memory = this.context.memory;
    this.tools = this.context.tools;
    this.skills = this.context.skills;
    this.sessions = this.context.sessions;
    this.agent = this.context.agent;
    this.hooks = this.context.hooks;
    this.mcp = this.context.mcp;
    this.skillLoader = this.context.skillLoader;
    this.events = this.context.events;
    this.works = this.context.works;
    this.projects = this.context.projects;
    this.distiller = new KnowledgeDistiller(this.context);
    this.fileHistory = this.context.fileHistory;
    this.goals = new GoalRunner(this, this.context.tasks);
    this.dag = new DagRunner(this, this.context.tasks);
    this.runs = new AgentRunStore(this.context.config.paths?.dataDir ?? "./data");

    // Startup recovery: repair any runs left in non-terminal state by a previous crash
    const recovered = this.runs.recoverStaleRuns();
    if (recovered > 0) {
      log("warn", `Recovered ${recovered} stale run(s) from previous session.`, {
        component: "AgentRunStore",
      });
    }

    // P1: 子代理调度 — 并发上限与每父会话派发上限由 config.agent.subAgents 控制
    this.subAgentDelegator = new SubAgentDelegator(this, {
      maxConcurrent: this.context.config.agent.subAgents?.maxConcurrent,
      maxChildRunsPerParent: this.context.config.agent.subAgents?.maxChildRunsPerParent,
      registry: this.context.tasks,
      dataDir: this.context.config.paths?.dataDir ?? "./data",
    });
    // P1.3: 启动时孤儿恢复 — 上次进程遗留的 running 子代理标记为 failed
    const orphaned = this.subAgentDelegator.recoverOrphanedSubAgents();
    if (orphaned > 0) {
      log("warn", `Recovered ${orphaned} orphaned sub-agent task(s) from previous session.`, {
        component: "SubAgentDelegator",
      });
    }
    if (!this.tools.get("delegate_subagent")) {
      this.tools.register(this.subAgentDelegator.getDelegationTool());
    }
    if (!this.tools.get("check_subagent_status")) {
      this.tools.register(this.subAgentDelegator.getCheckStatusTool());
    }
    if (!this.tools.get("agent_list")) {
      this.tools.register(this.subAgentDelegator.getListTool());
    }
    if (!this.tools.get("agent_output")) {
      this.tools.register(this.subAgentDelegator.getOutputTool());
    }
    if (!this.tools.get("agent_kill")) {
      this.tools.register(this.subAgentDelegator.getKillTool());
    }
    // P2.1: goal 模式工具面
    if (!this.tools.get("start_goal")) {
      this.tools.register(this.goals.getStartGoalTool());
    }
    if (!this.tools.get("goal_status")) {
      this.tools.register(this.goals.getStatusTool());
    }
    if (!this.tools.get("goal_list")) {
      this.tools.register(this.goals.getListTool());
    }
    // P2.2: DAG 工具面
    if (!this.tools.get("run_dag")) {
      this.tools.register(this.dag.getRunTool());
    }
    if (!this.tools.get("dag_status")) {
      this.tools.register(this.dag.getStatusTool());
    }

    // P1: Register built-in post-turn hook for context budget awareness
    this.hooks.onPostTurn((ctx) => {
      // P2.9: 预算基线 = 激活模型窗口（与 agent 硬闸门一致），
      // 而非用户组装预算（config.context.maxTokens）——否则 16k 配置会在
      // 对话历史还很空时就注入停止提醒，让模型不敢派发子代理/继续调研。
      const currentMaxTokens = this.context.agent.contextWindowTokens;
      const ratio = ctx.estimatedTokens / currentMaxTokens;

      if (ratio > 0.85 && ctx.round >= 3) {
        console.warn(
          `[PostTurnHook] Round ${ctx.round}: ${ctx.estimatedTokens}/${currentMaxTokens} tokens (${(ratio * 100).toFixed(0)}%) — injecting stop reminder`
        );
        return {
          injectMessage:
            `⚠️ 已执行 ${ctx.round} 轮工具调用，上下文预算即将用尽 (${(ratio * 100).toFixed(0)}%)。` +
            `请立即停止进一步文件读取/数据搜索，基于当前已收集的信息直接总结输出结论。`,
        };
      }
    });
  }

  /**
   * P2.9: 会话级历史压缩（Claude Code auto-compact / Kun token 阈值模式）。
   * 触发条件从「固定 30 条」改为「估算 token 超过窗口 60%」（force 时无条件），
   * 压缩时用当前模型生成语义摘要，失败回退静态归档注记（SessionManager 兜底）。
   * 仅在 run 结束时调用（run 内由 agent 软阈值压缩负责，避免与 save(sessionObj)
   * 的内存快照竞态导致重复总结）。
   */
  private async maybeCompactSession(sessionId: string, force = false): Promise<void> {
    const session = this.sessions.load(sessionId);
    if (!session || session.messages.length < 10) return;
    const estTokens = defaultTokenEstimator(
      session.messages
        .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
        .join("\n")
    );
    const threshold = Math.floor(this.context.agent.contextWindowTokens * 0.6);
    if (!force && estTokens < threshold) return;
    await this.sessions.autoCompact(sessionId, 10, 16, (pruned) =>
      this.context.agent.summarizeMessages(pruned)
    );
  }

  /**
   * 核心入口：全渠道统一 Agent 执行点 (带 H1.5 错误隔离边界防护)
   * W0: 在各关键节点写入 RuntimeEvent
   */
  async execute(input: RuntimeInput): Promise<RuntimeOutput> {
    const startTime = Date.now();
    // P2.8: 用户主动发起的 turn → 标记活动租约（后台/主动触发将暂时跳过）
    this.context.activityPolicy.markActivity();
    const runId = generateId("run_");
    // P0.4: 本次 run 的事件溯源关联 ID（所有派生事件共享同一 correlationId）
    const correlationId = generateId("corr_");
    // P2-B8: 汇总本次 run 内所有 LLM 调用的用量与费用（Agent 通过 onUsage 逐次上报）
    let runUsage: (NormalizedUsage & { costUsd?: number }) | undefined;
    let runModel: string | undefined;
    const activeModelId = resolveLlmSelection(this.context.config).modelId;

    // 1. Session 加载或恢复（P0 恢复流水线：会话文件缺失但事件流存在时从事件流重建）
    let sessionObj: Session;
    if (input.sessionId) {
      const { session } = await recoverSession(input.sessionId, {
        sessions: this.sessions,
        events: this.events,
      });
      sessionObj = session ?? this.sessions.create(undefined, input.sessionId);
    } else {
      sessionObj = this.sessions.getOrCreate();
    }
    const sessionId = sessionObj.id;
    const channel = input.channel ?? "api";
    // P0-2: 会话执行模式（plan 模式下 Agent 仅能执行只读/计划工具）
    const planModeActive = this.sessions.getMode(sessionId) === "plan";

    // Run: create durable run record
    this.runs.createRun({
      runId,
      sessionId,
      workId: sessionId,
      status: "running",
      startedAt: new Date().toISOString(),
    });

    // W0: 写入 session_started 事件（若首次）
    const isFirstRun = sessionObj.messages.length === 0;
    if (isFirstRun) {
      await this.events.append({
        id: generateId("evt_"),
        sessionId,
        correlationId,
        type: "session_started",
        timestamp: new Date().toISOString(),
        payload: { title: sessionObj.title, channel },
      });

      // W1: 若是首次运行且无对应 Work，自动创建 Work（workId === sessionId）
      // V1.2: 携带 workspaceRoot 时幂等升级为 Project（同一目录永远复用同一项目）
      const existingWork = this.works.get(sessionId);
      let workProjectId: string | undefined;
      let resolvedWorkspaceRoot = input.workspaceRoot;
      if (input.workspaceRoot) {
        try {
          const { project } = await this.projects.getOrCreateFromRoot(input.workspaceRoot);
          workProjectId = project.id;
          resolvedWorkspaceRoot = project.workspaceRoot;
        } catch (err) {
          log("warn", "project ensure failed", { error: String(err) });
        }
      }
      if (!existingWork) {
        this.works.create({
          intent: input.prompt,
          sessionId,
          kind: "primary",
          workspaceRoot: resolvedWorkspaceRoot,
          projectId: workProjectId,
        });
      }
    }

    // W1: 当前 Work ID（1:1 映射 sessionId），供 agent / 工具使用
    const workId = sessionId;
    // 缓存本轮工具调用的 toolCallId 映射：agent 内生成的 (toolName) → runtime toolCallId
    const pendingToolCalls = new Map<string, string>();

    // W0: 写入 user_message 事件（附带图片缩略信息，供历史渲染；超限图片跳过）
    const userMsgEventId = generateId("evt_");
    const eventAttachments = (input.attachments ?? [])
      .filter(
        (a) =>
          a.mimeType?.startsWith("image/") &&
          a.dataBase64 &&
          a.dataBase64.length <= MAX_ATTACHMENT_BASE64_CHARS
      )
      .map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        dataUrl: `data:${a.mimeType};base64,${a.dataBase64}`,
      }));
    await this.events.append({
      id: userMsgEventId,
      sessionId,
      correlationId,
      type: "user_message",
      timestamp: new Date().toISOString(),
      payload: {
        content: input.prompt,
        channel,
        messageId: generateId("msg_"),
        ...(eventAttachments.length > 0 ? { attachments: eventAttachments } : {}),
      },
    });

    // 2. 触发 sessionStart Hook
    await this.hooks.runSessionStart({ sessionId });

    let content = "";
    let isError = false;
    let errorDetail: string | undefined;

    try {
      // 3. Execute Agent core loop
      const history = sessionObj.messages || [];

      // Infer session trust level from channel unless caller provides explicit override.
      // tui/desktop/cli are local, trusted surfaces → "standard" (workspace writes don't ask).
      // telegram/api/proactive-trigger are remote/automated → "minimal" (always ask).
      const inferredTrustLevel: SessionTrustLevel = (() => {
        if (input.trustLevel) return input.trustLevel;
        const ch = channel as string;
        if (ch === "tui" || ch === "cli") return "full"; // local interactive, mirror TUI allow-all
        if (ch === "desktop" || ch === "web" || ch === "web-sse") return "standard";
        return "minimal"; // telegram, api-json, proactive-trigger, unknown
      })();

      // context.agent 会在 setActiveConnection 时被重建；必须动态读取，
      // 否则激活新连接后仍会走旧 agent（旧 LLM provider）。
      // 无痕模式：显式传入优先，其次读取 Work.metadata.incognito
      const incognito =
        input.options?.incognito ?? this.works.get(workId)?.metadata?.incognito === true;
      content = await this.context.agent.run(input.prompt, history, {
        ...input.options,
        // "模型的眼睛"：把用户附件传给 Agent（转为 image_url ContentPart）
        attachments: input.attachments,
        incognito,
        // Ensure channel is injected so PermissionPolicy sees the correct surface
        channel: input.options?.channel ?? channel,
        // Session trust level — overrides surface default
        trustLevel: inferredTrustLevel,
        // Cancellation signal for LLM completions and shell commands
        signal: input.signal ?? input.options?.signal,
        // sessionId already resolved by sessions.getOrCreate
        sessionId,
        // W1.3: Work context for update_work_plan and built-in tools
        workId,
        workManager: this.works,
        planMode: planModeActive,
        sessionMode: {
          get: () => this.sessions.getMode(sessionId),
          set: (mode: "normal" | "plan") => {
            this.sessions.setMode(sessionId, mode);
            void this.events.append({
              id: generateId("evt_"),
              sessionId,
              correlationId,
              parentEventId: userMsgEventId,
              type: "plan_mode_changed",
              timestamp: new Date().toISOString(),
              payload: { mode, by: "agent_tool" },
            });
          },
        },
        backgroundTasks: this.context.backgroundTasks,
        subAgents: this.subAgentDelegator,
        onIntermediateMessage: async (interContent) => {
          void (await this.events.append({
            id: generateId("evt_"),
            sessionId,
            correlationId,
            parentEventId: userMsgEventId,
            type: "assistant_message",
            timestamp: new Date().toISOString(),
            payload: { content: interContent },
          }));
          if (input.options?.onIntermediateMessage) {
            input.options.onIntermediateMessage(interContent);
          }
        },
        // W0 / W2.2: 写入 tool_call / tool_result / approval_requested 事件
        onToolStart: async (toolName, args, toolCallId) => {
          const callId = toolCallId || generateId("call_");
          pendingToolCalls.set(callId, toolName);
          void (await this.events.append({
            id: generateId("evt_"),
            sessionId,
            correlationId,
            parentEventId: userMsgEventId,
            type: "tool_call",
            timestamp: new Date().toISOString(),
            payload: { toolCallId: callId, toolName, args },
          }));
          if (input.options?.onToolStart) input.options.onToolStart(toolName, args, callId);
        },
        onToolEnd: async (toolName, result, durationMs, success, toolCallId, artifactRef) => {
          const callId = toolCallId || pendingToolCalls.get(toolName) || generateId("call_");
          pendingToolCalls.delete(callId);
          void (await this.events.append({
            id: generateId("evt_"),
            sessionId,
            correlationId,
            parentEventId: userMsgEventId,
            type: "tool_result",
            timestamp: new Date().toISOString(),
            payload: {
              toolCallId: callId,
              toolName,
              result,
              isError: !success,
              durationMs,
              ...(artifactRef ? { artifactRef } : {}),
            },
          }));
          if (input.options?.onToolEnd) {
            input.options.onToolEnd(toolName, result, durationMs, success, callId, artifactRef);
          }
        },
        onThinking: async (reasoningContent, durationMs) => {
          void (await this.events.append({
            id: generateId("evt_"),
            sessionId,
            correlationId,
            parentEventId: userMsgEventId,
            type: "thinking",
            timestamp: new Date().toISOString(),
            payload: { content: reasoningContent, durationMs },
          }));
          if (input.options?.onThinking) input.options.onThinking(reasoningContent, durationMs);
        },
        onApprovalRequested: async ({ approvalId, toolName, args, permission }) => {
          let diff: string | undefined;
          if (toolName === "replace_file_content" || toolName === "write_file") {
            try {
              const filePath = String(args.path ?? "");
              const oldContent = existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
              const newContent =
                toolName === "replace_file_content"
                  ? oldContent
                    ? oldContent.replace(
                        String(args.targetContent ?? ""),
                        String(args.replacementContent ?? "")
                      )
                    : String(args.replacementContent ?? "")
                  : String(args.content ?? "");
              diff = generateFileDiff(filePath, oldContent, newContent);
            } catch {
              /* ignore preflight diff error */
            }
          }

          void (await this.events.append({
            id: generateId("evt_"),
            sessionId,
            correlationId,
            parentEventId: userMsgEventId,
            type: "approval_requested",
            timestamp: new Date().toISOString(),
            payload: { approvalId, toolName, args, permission, diff },
          }));

          // L1 (D7): 把预检 diff 转交调用方（API server 用于 SSE confirm_required）
          if (input.options?.onApprovalRequested) {
            try {
              await input.options.onApprovalRequested({
                approvalId,
                toolName,
                args,
                permission,
                diff,
              });
            } catch {
              /* non-blocking */
            }
          }
          return { diff };
        },
        onUsage: (usage) => {
          const { model: _reportedModel, ...usageOnly } = usage;
          runUsage = runUsage ? sumUsage([runUsage, usageOnly]) : usageOnly;
          runModel = usage.model || runModel;
        },
        // "模型的眼睛"：视觉协助调用留痕（事件 + 用量汇总）
        onVisionCompanionCall: (info) => {
          void this.events.append({
            id: generateId("evt_"),
            sessionId,
            correlationId,
            parentEventId: userMsgEventId,
            type: "vision_companion_call",
            timestamp: new Date().toISOString(),
            payload: info,
          });
          if (info.usage) {
            runUsage = runUsage ? sumUsage([runUsage, info.usage]) : info.usage;
          }
          // 供 channel（SSE 等）实时展示「正在用视觉模型看图」状态
          input.options?.onVisionCompanionCall?.(info);
        },
      });

      // 4. 追加 User 与 Assistant 对话记录到 Session 中并持久化
      sessionObj.messages.push({
        id: generateId("msg_"),
        role: "user",
        content: input.prompt,
        timestamp: startTime,
        channel: input.channel,
      });

      sessionObj.messages.push({
        id: generateId("msg_"),
        role: "assistant",
        content,
        timestamp: Date.now(),
        channel: input.channel,
      });

      // 5. 自动根据首条意图更新 Session 标题（避免纯时间戳标题刷屏）
      const cleanPrompt = input.prompt.replace(/\s+/g, " ").trim();
      const titleStr = sessionObj.title || "";
      if (
        cleanPrompt &&
        (titleStr.startsWith("会话 ") ||
          titleStr.startsWith("Session ") ||
          sessionObj.messages.length <= 2)
      ) {
        sessionObj.title = cleanPrompt.length > 24 ? `${cleanPrompt.slice(0, 24)}...` : cleanPrompt;
      }

      // W0: 写入 assistant_message 事件
      const durationMs = Date.now() - startTime;
      await this.events.append({
        id: generateId("evt_"),
        sessionId,
        correlationId,
        parentEventId: userMsgEventId,
        type: "assistant_message",
        timestamp: new Date().toISOString(),
        payload: {
          content,
          durationMs,
        },
      });

      // W0: 写入 run_finished 事件
      await this.events.append({
        id: generateId("evt_"),
        sessionId,
        correlationId,
        parentEventId: userMsgEventId,
        type: "run_finished",
        timestamp: new Date().toISOString(),
        payload: {
          runId,
          durationMs,
          success: true,
          ...(runUsage ? { usage: runUsage } : {}),
          model: runModel ?? activeModelId,
        },
      });

      // P0.4: 最小 checkpoint 写入点 — 每次 run 成功后锚定一个可恢复状态
      // （事件流 append-only，checkpoint 仅记录引用，为 P2.6 rewind 铺路）
      await this.events.append({
        id: generateId("evt_"),
        sessionId,
        correlationId,
        parentEventId: userMsgEventId,
        type: "checkpoint",
        timestamp: new Date().toISOString(),
        payload: { kind: "work", label: `run ${runId} completed`, ref: runId },
      });

      // Run: mark as completed
      this.runs.completeRun(runId, "completed");
      if (workId) {
        this.works.update(workId, { status: "completed" });
      }

      // 6. 更新与保存 Session（P2.9: token 估算超窗口 60% 时语义压缩历史）
      this.sessions.save(sessionObj);
      await this.maybeCompactSession(sessionId);

      // V1.3: 记忆→知识提纯 — 后台异步扫描空闲会话（内部有频率/并发门控）
      void this.distiller.maybeDistillIdleSessions().catch((err) => {
        log("warn", "[KnowledgeDistiller] 后台扫描异常", { error: String(err) });
      });
    } catch (err: any) {
      isError = true;
      errorDetail = err?.message || String(err);
      if (workId) {
        this.works.update(workId, { status: "failed" });
      }
      log("error", `❌ [HarnessRuntime Execution Error] SessionId: ${sessionId}`, {
        channel: input.channel,
        error: errorDetail,
      });

      content = i18n().t("runtime.agent_failure", { error: errorDetail ?? "unknown error" });
      if (input.options?.onChunk) {
        input.options.onChunk(content);
      }

      // Run: mark as failed
      this.runs.completeRun(runId, "failed", {
        failureClass: "error",
        errorMessage: errorDetail,
      });

      // W0: 写入 error 事件
      await this.events
        .append({
          id: generateId("evt_"),
          sessionId,
          correlationId,
          parentEventId: userMsgEventId,
          type: "error",
          timestamp: new Date().toISOString(),
          payload: {
            message: errorDetail ?? "unknown error",
            stack: err?.stack,
            phase: "agent.run",
          },
        })
        .catch(() => {}); // 错误写入失败不级联

      // 故障发生时同样保存包含错误提示的 Session 记录
      sessionObj.messages.push({
        id: generateId("msg_"),
        role: "user",
        content: input.prompt,
        timestamp: startTime,
        channel: input.channel,
      });

      sessionObj.messages.push({
        id: generateId("msg_"),
        role: "assistant",
        content,
        timestamp: Date.now(),
        channel: input.channel,
      });

      this.sessions.save(sessionObj);
    }

    const durationMs = Date.now() - startTime;
    const status = this.getStatus();

    return {
      sessionId,
      content,
      durationMs,
      channel: (input.channel as string) || "default",
      statusRatio: status.context?.ratio || "0%",
      isError,
      errorDetail,
      ...(runUsage ? { usage: runUsage } : {}),
    };
  }

  /**
   * Mid-turn Steering 对话中途转向
   */
  steer(prompt: string): boolean {
    return this.context.agent.steer(prompt);
  }

  /**
   * Follow-Up 队列排队指令
   */
  followUp(prompt: string): void {
    this.context.agent.followUp(prompt);
  }

  /**
   * 获取运行时仪表盘与状态
   */
  getStatus() {
    return this.context.getStatus();
  }

  async getWorkActivity(workId: string) {
    return await this.works.listActivities(workId);
  }

  /**
   * P0: 会话恢复流水线入口 — 校验/修复/重建指定会话
   * 供 CLI（hachimi session resume / recover）与 API 显式调用。
   */
  async recoverSession(sessionId: string): Promise<SessionRecoveryReport> {
    const { report } = await recoverSession(sessionId, {
      sessions: this.sessions,
      events: this.events,
    });
    return report;
  }

  /**
   * 便携记忆全量导出
   */
  async exportBundle(options?: ExportBundleOptions): Promise<HachimiBundleV1> {
    return exportBundle(this.context, options);
  }

  /**
   * 便携记忆叠加/去重导入与 Schema 自动迁移
   */
  async importBundle(
    bundleSource: string | HachimiBundleV1,
    options?: ImportBundleOptions
  ): Promise<ImportBundleResult> {
    return importBundle(this.context, bundleSource, options);
  }

  /**
   * 彻底删除指定 Session 及其相关事件流、执行记录（彻底擦除数据）
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    // 0. 清理 rewind 快照内容（事件保留在事件流中，随 events.delete 一并删除）
    await this.fileHistory.clearSession(sessionId);

    // 1. 从 SessionManager (SQLite / FileStore) 中彻底删除
    this.sessions.delete(sessionId);

    // 2. 删除事件流数据 (events/*.jsonl)
    await this.events.delete(sessionId);

    // 3. 删除 AgentRunStore 记录 (runs/*.json)
    this.runs.deleteSessionRuns(sessionId);

    return true;
  }

  /**
   * P2.6: 列出某 Session 的文件快照链（/rewind 数据视图；纯读，不落盘）。
   */
  async listFileHistory(sessionId: string, filePath?: string): Promise<SnapshotChain> {
    return this.fileHistory.listChain(sessionId, filePath);
  }

  /**
   * 彻底删除指定 Work 及其绑定的所有 Sessions、事件流、执行记录
   */
  async deleteWork(workId: string): Promise<boolean> {
    const dataDir = this.context.config.paths?.dataDir ?? "./data";
    const work = this.works.get(workId);
    const sessionIds = new Set<string>();

    sessionIds.add(workId);
    if (work?.sessionIds) {
      for (const sid of work.sessionIds) {
        sessionIds.add(sid);
      }
    }

    // 逐个擦除关联的 Session、事件流、Run 记录
    for (const sid of sessionIds) {
      await this.deleteSession(sid);
    }

    // 从 WorkManager 中彻底擦除
    const deleted = this.works.delete(workId);

    // 确保物理 work json 被删掉
    const workFilePath = join(dataDir, "works", `${workId}.json`);
    if (existsSync(workFilePath)) {
      try {
        unlinkSync(workFilePath);
      } catch {
        /* ignore */
      }
    }

    return deleted;
  }
}

let globalRuntimeInstance: HarnessRuntime | null = null;

/**
 * 工厂与单例获取函数：提供统一的 HarnessRuntime 实例
 */
export function createHarnessRuntime(options: CreateAppContextOptions = {}): HarnessRuntime {
  return new HarnessRuntime(options);
}

export function getOrCreateHarnessRuntime(options: CreateAppContextOptions = {}): HarnessRuntime {
  if (!globalRuntimeInstance) {
    globalRuntimeInstance = new HarnessRuntime(options);
  }
  return globalRuntimeInstance;
}
