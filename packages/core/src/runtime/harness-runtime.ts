// packages/core/src/runtime/harness-runtime.ts
import { generateId, log } from "@hachimi/shared";
import { SubAgentDelegator } from "../agent/sub-agent.js";
import type { Agent } from "../agent/agent.js";
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
import type { SessionManager } from "../session/manager.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ChannelType } from "../types/index.js";
import type { AppContext, CreateAppContextOptions } from "./context.js";
import { createAppContext } from "./context.js";

export interface RuntimeInputOptions {
  onChunk?: (chunk: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, result: string, durationMs: number, success: boolean) => void;
}

export interface RuntimeInput {
  prompt: string;
  sessionId?: string;
  channel?: ChannelType;
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
   */
  async execute(input: RuntimeInput): Promise<RuntimeOutput> {
    const startTime = Date.now();

    // 1. Session 加载或获取
    const sessionObj = this.sessions.getOrCreate(input.sessionId);
    const sessionId = sessionObj.id;

    // 2. 触发 sessionStart Hook
    await this.hooks.runSessionStart({ sessionId });

    let content = "";
    let isError = false;
    let errorDetail: string | undefined;

    try {
      // 3. 执行 Agent 核心对话循环
      const history = sessionObj.messages || [];
      content = await this.agent.run(input.prompt, history, input.options);

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

      // 6. 更新与保存 Session
      this.sessions.save(sessionObj);
    } catch (err: any) {
      isError = true;
      errorDetail = err?.message || String(err);
      log("error", `❌ [HarnessRuntime Execution Error] SessionId: ${sessionId}`, {
        channel: input.channel,
        error: errorDetail,
      });

      content = `⚠️ [Agent 运行故障] ${errorDetail}。请检查模型配置与网络连通性。`;
      if (input.options?.onChunk) {
        input.options.onChunk(content);
      }

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
