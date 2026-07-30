import { generateId, log, type NormalizedUsage } from "@hachimi/shared";
import type { Agent } from "../agent/agent.js";
import { SubAgentDelegator } from "../agent/sub-agent.js";
import type { IEventStore } from "../events/event-store.js";
import type { HookRegistry } from "../extensions/hooks.js";
import type { McpClientManager } from "../extensions/mcp-client.js";
import type { SkillPackageLoader } from "../extensions/skill-package.js";
import type { MemoryManager } from "../memory/manager.js";
import { exportBundle } from "../portable/exporter.js";
import { importBundle } from "../portable/importer.js";
import type {
  ExportBundleOptions,
  HachimiBundleV1,
  ImportBundleOptions,
  ImportBundleResult,
} from "../portable/types.js";
import { AgentRunStore } from "../run/agent-run-store.js";
import type { SessionManager } from "../session/manager.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { SurfaceType } from "../tools/policy.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ChannelType } from "../types/index.js";
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
    toolCallId?: string
  ) => void;
  onThinking?: (reasoningContent: string) => void;
  onIntermediateMessage?: (content: string) => void;
  onToolApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    permission?: string
  ) => Promise<boolean>;
  /**
   * per-call surface 覆盖；通常由 RuntimeInput.channel 自动注入，无需手动设置
   */
  channel?: SurfaceType | ChannelType;
  /**
   * H3.5: 子 Agent 派生或单次调用的最大轮次限制
   */
  maxRounds?: number;
}

export interface RuntimeInput {
  prompt: string;
  sessionId?: string;
  channel?: SurfaceType | ChannelType;
  providerOverride?: string;
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
  /** Run: Durable run ledger for crash recovery */
  public readonly runs: AgentRunStore;

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
    this.runs = new AgentRunStore(this.context.config.paths?.dataDir ?? "./data");

    // Startup recovery: repair any runs left in non-terminal state by a previous crash
    const recovered = this.runs.recoverStaleRuns();
    if (recovered > 0) {
      log("warn", `Recovered ${recovered} stale run(s) from previous session.`, {
        component: "AgentRunStore",
      });
    }

    // Automatically register sub-agent delegation and status check tools
    this.subAgentDelegator = new SubAgentDelegator(this);
    if (!this.tools.get("delegate_subagent")) {
      this.tools.register(this.subAgentDelegator.getDelegationTool());
    }
    if (!this.tools.get("check_subagent_status")) {
      this.tools.register(this.subAgentDelegator.getCheckStatusTool());
    }
  }

  /**
   * 核心入口：全渠道统一 Agent 执行点 (带 H1.5 错误隔离边界防护)
   * W0: 在各关键节点写入 RuntimeEvent
   */
  async execute(input: RuntimeInput): Promise<RuntimeOutput> {
    const startTime = Date.now();
    const runId = generateId("run_");

    // 1. Session 加载或获取
    const sessionObj = this.sessions.getOrCreate(input.sessionId);
    const sessionId = sessionObj.id;
    const channel = input.channel ?? "api";

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
        type: "session_started",
        timestamp: new Date().toISOString(),
        payload: { title: sessionObj.title, channel },
      });

      // W1: 若是首次运行且无对应 Work，自动创建 Work（workId === sessionId）
      const existingWork = this.works.get(sessionId);
      if (!existingWork) {
        this.works.create({
          intent: input.prompt,
          sessionId,
          kind: "primary",
        });
      }
    }

    // W1: 当前 Work ID（1:1 映射 sessionId），供 agent / 工具使用
    const workId = sessionId;
    // 缓存本轮工具调用的 toolCallId 映射：agent 内生成的 (toolName) → runtime toolCallId
    const pendingToolCalls = new Map<string, string>();

    // W0: 写入 user_message 事件
    const userMsgEventId = generateId("evt_");
    await this.events.append({
      id: userMsgEventId,
      sessionId,
      type: "user_message",
      timestamp: new Date().toISOString(),
      payload: {
        content: input.prompt,
        channel,
        messageId: generateId("msg_"),
      },
    });

    // 2. 触发 sessionStart Hook
    await this.hooks.runSessionStart({ sessionId });

    let content = "";
    let isError = false;
    let errorDetail: string | undefined;

    try {
      // 3. 执行 Agent 核心对话循环
      const history = sessionObj.messages || [];
      content = await this.agent.run(input.prompt, history, {
        ...input.options,
        // 确保 channel 注入到 AgentRunOptions，使 PermissionPolicy 感知正确的 surface
        channel: input.options?.channel ?? channel,
        // sessionId 已由 sessions.getOrCreate 解析；此处传入确保 Agent 层工具调用携带正确 sessionId
        sessionId,
        // W1.3: Work 上下文，使 update_work_plan 等内置工具可以读写 Work.plan
        workId,
        workManager: this.works,
        onIntermediateMessage: async (interContent) => {
          void (await this.events.append({
            id: generateId("evt_"),
            sessionId,
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
            type: "tool_call",
            timestamp: new Date().toISOString(),
            payload: { toolCallId: callId, toolName, args },
          }));
          if (input.options?.onToolStart) input.options.onToolStart(toolName, args, callId);
        },
        onToolEnd: async (toolName, result, durationMs, success, toolCallId) => {
          const callId = toolCallId || pendingToolCalls.get(toolName) || generateId("call_");
          pendingToolCalls.delete(callId);
          void (await this.events.append({
            id: generateId("evt_"),
            sessionId,
            type: "tool_result",
            timestamp: new Date().toISOString(),
            payload: {
              toolCallId: callId,
              toolName,
              result,
              isError: !success,
              durationMs,
            },
          }));
          if (input.options?.onToolEnd) {
            input.options.onToolEnd(toolName, result, durationMs, success, callId);
          }
        },
        onThinking: async (reasoningContent) => {
          void (await this.events.append({
            id: generateId("evt_"),
            sessionId,
            type: "thinking",
            timestamp: new Date().toISOString(),
            payload: { content: reasoningContent },
          }));
          if (input.options?.onThinking) input.options.onThinking(reasoningContent);
        },
        onApprovalRequested: async ({ approvalId, toolName, args, permission }) => {
          void (await this.events.append({
            id: generateId("evt_"),
            sessionId,
            type: "approval_requested",
            timestamp: new Date().toISOString(),
            payload: { approvalId, toolName, args, permission },
          }));
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
        type: "run_finished",
        timestamp: new Date().toISOString(),
        payload: { runId, durationMs, success: true },
      });

      // Run: mark as completed
      this.runs.completeRun(runId, "completed");
      if (workId) {
        this.works.update(workId, { status: "completed" });
      }

      // 6. 更新与保存 Session
      this.sessions.save(sessionObj);
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

      content = `⚠️ [Agent 运行故障] ${errorDetail}。请检查模型配置与网络连通性。`;
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
    };
  }

  /**
   * Mid-turn Steering 对话中途转向
   */
  steer(prompt: string): boolean {
    return this.agent.steer(prompt);
  }

  /**
   * Follow-Up 队列排队指令
   */
  followUp(prompt: string): void {
    this.agent.followUp(prompt);
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
