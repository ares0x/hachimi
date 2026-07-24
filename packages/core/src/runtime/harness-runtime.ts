// packages/core/src/runtime/harness-runtime.ts
import type { Agent } from "../agent/agent.js";
import type { HookRegistry } from "../extensions/hooks.js";
import type { McpClientManager } from "../extensions/mcp-client.js";
import type { SkillPackageLoader } from "../extensions/skill-package.js";
import type { MemoryManager } from "../memory/manager.js";
import { exportBundle } from "../portable/exporter.js";
import type { ImportBundleOptions, ImportBundleResult, ExportBundleOptions } from "@hachimi/core";
import { importBundle } from "../portable/importer.js";
import type { HachimiBundleV1 } from "../portable/types.js";
import type { SessionManager } from "../session/manager.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { ToolRegistry } from "../tools/registry.js";
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
  channel?: "cli" | "tui" | "api" | "telegram" | "web" | string;
  providerOverride?: string;
  options?: RuntimeInputOptions;
}

export interface RuntimeOutput {
  sessionId: string;
  content: string;
  durationMs: number;
  channel?: string;
  statusRatio?: string;
}

/**
 * 统一的核心 Harness 运行时 Orchestrator 主类 (HarnessRuntime)
 * 收拢 Agent 循环、上下文组装、Tool 执行、Memory 更新与插件 Hook 拦截
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
  }

  /**
   * 核心入口：全渠道统一 Agent 执行点
   */
  async execute(input: RuntimeInput): Promise<RuntimeOutput> {
    const startTime = Date.now();

    // 1. Session 加载或获取
    if (input.sessionId) {
      this.sessions.load(input.sessionId);
    }
    const sessionObj = this.sessions.getOrCreate();
    const sessionId = sessionObj.id;

    // 2. 触发 sessionStart Hook
    await this.hooks.runSessionStart({ sessionId });

    // 3. 执行 Agent 核心对话循环
    const history = sessionObj.messages || [];
    const content = await this.agent.run(input.prompt, history, input.options);

    // 4. 更新与保存 Session
    this.sessions.save(sessionObj);

    const durationMs = Date.now() - startTime;
    const status = this.getStatus();

    return {
      sessionId,
      content,
      durationMs,
      channel: input.channel || "default",
      statusRatio: status.context?.ratio || "0%",
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
