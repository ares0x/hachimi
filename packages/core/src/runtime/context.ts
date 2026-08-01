// packages/core/src/runtime/context.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  getActiveProviderConfig,
  type HachimiConfig,
  loadConfig,
  type ProviderConfig,
  saveConfig,
} from "@hachimi/config";
import { log } from "@hachimi/shared";
import { FileDirStore, FileJsonStore, SQLiteStore } from "@hachimi/storage";
import { Agent } from "../agent/agent.js";
import { createLLMFromConfig } from "../agent/llm-factory.js";
import { ContextBuilder } from "../context/builder.js";
import { PersonalContextLoader } from "../context/personal-context.js";
import type { IEventStore } from "../events/event-store.js";
import { FileEventStore } from "../events/file-event-store.js";
import { HookRegistry } from "../extensions/hooks.js";
import { McpClientManager } from "../extensions/mcp-client.js";
import { SkillPackageLoader } from "../extensions/skill-package.js";
import { MemoryManager } from "../memory/manager.js";
import { SessionManager } from "../session/manager.js";
import { contentFromBrainSkill, summarySkill, writingSkill } from "../skills/builtin/index.js";
import { SkillRegistry } from "../skills/registry.js";
import { registerBuiltinTools } from "../tools/builtin/index.js";
import { registerBuiltinMcpServers } from "../extensions/mcp-builtin/index.js";
import {
  defaultPermissionPolicy,
  type PermissionPolicy,
  type SurfaceType,
} from "../tools/policy.js";
import { ToolRegistry } from "../tools/registry.js";
import { WorkManager } from "../work/work-manager.js";

export interface AppContext {
  config: HachimiConfig;
  memory: MemoryManager;
  sessions: SessionManager;
  tools: ToolRegistry;
  skills: SkillRegistry;
  agent: Agent;
  contextBuilder: ContextBuilder;
  personalContextLoader: PersonalContextLoader;
  hooks: HookRegistry;
  mcp: McpClientManager;
  skillLoader: SkillPackageLoader;
  /** W0: Append-only event store (truth source) */
  events: IEventStore;
  /** W1: Work manager */
  works: WorkManager;
  /** W2.1: 权限策略表 */
  permissionPolicy: PermissionPolicy;
  getConfig(): HachimiConfig;
  setActiveProvider(provider: string, pConfig?: Partial<ProviderConfig>): void;
  getStatus(): Record<string, any>;
}

export interface CreateAppContextOptions {
  configPath?: string;
  configOverride?: Partial<HachimiConfig>;
  providerOverride?: string;
  channelPolicy?: "deny" | "allow-safe" | "allowlist";
  allowedTools?: string[];
  permissionPolicy?: PermissionPolicy;
  onToolApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    permission: string,
    channel?: string
  ) => Promise<boolean>;
}

/**
 * 创建应用基础设施上下文 (Composition Root)
 */
export function createAppContext(options: CreateAppContextOptions = {}): AppContext {
  const config = loadConfig(options.configPath || "config.json");

  if (options.providerOverride) {
    config.llm.activeProvider = options.providerOverride;
  }
  if (options.configOverride) {
    Object.assign(config, options.configOverride);
  }

  log("info", "hachimi starting", {
    provider: config.llm.activeProvider,
    dataDir: config.paths.dataDir,
    storage: "sqlite",
  });

  const sqlitePath = resolve(config.paths.dataDir, "hachimi.db");
  const sqliteStore = new SQLiteStore(sqlitePath);

  const memory = new MemoryManager(config.paths.memoryFile, sqliteStore);
  const sessions = new SessionManager(config.paths.sessionsDir, sqliteStore);
  const tools = new ToolRegistry();
  tools.setKnowledgeRoots(
    config.personalContext?.knowledgeRoot,
    config.personalContext?.knowledgeWriteRoot
  );
  const skills = new SkillRegistry();
  const hooks = new HookRegistry();
  const mcp = new McpClientManager();
  const skillLoader = new SkillPackageLoader();
  const personalContextLoader = new PersonalContextLoader(config.personalContext);
  const permissionPolicy = options.permissionPolicy || defaultPermissionPolicy;

  // W0: 初始化 append-only 事件存储
  const events: IEventStore = new FileEventStore(config.paths.dataDir);

  // W1: 初始化 Work 管理器
  const works = new WorkManager(config.paths.dataDir, events);

  skills.register(writingSkill);
  skills.register(summarySkill);
  skills.register(contentFromBrainSkill);

  registerBuiltinTools(tools);
  registerBuiltinMcpServers(tools);

  // 自动扫描加载外部技能包
  const externalSkills = skillLoader.loadPackages();
  for (const extSkill of externalSkills) {
    skills.register(extSkill);
  }

  const seedDemoMemory =
    process.env.HACHIMI_SEED_DEMO_MEMORY === "true" || process.argv.includes("--demo");
  if (seedDemoMemory && memory.list("long_term").length === 0) {
    memory.remember("用户的名字是小明，喜欢简洁的回答", 0.9);
    memory.remember("用户正在开发一个叫 hachimi 的个人助理项目", 0.85);
  }

  let llm = createLLMFromConfig(config);
  const contextBuilder = new ContextBuilder();

  // W2.1: 基于 PermissionPolicy 矩阵的权限校验兜底
  const defaultApprovalHandler = async (
    toolName: string,
    _args: Record<string, unknown>,
    permission: string,
    channel?: string
  ): Promise<boolean> => {
    const surface = (channel || "cli") as SurfaceType;
    return permissionPolicy.isAllowed(surface, toolName, permission as any);
  };

  const effectiveToolApproval = options.onToolApproval || defaultApprovalHandler;

  let agent = new Agent({
    llm,
    tools,
    memory,
    skills,
    contextBuilder,
    personalContextLoader,
    hooks,
    maxToolRounds: config.agent.maxToolRounds,
    maxTokens: config.context.maxTokens,
    mode: config.context.defaultMode,
    summaryThreshold: config.context.summaryThreshold,
    onToolApproval: effectiveToolApproval,
  });

  sessions.getOrCreate();
  const session = sessions.getCurrent();

  log("info", "session ready", {
    id: session?.id,
    messages: session?.messages.length ?? 0,
  });

  const context: AppContext = {
    config,
    memory,
    sessions,
    tools,
    skills,
    agent,
    contextBuilder,
    personalContextLoader,
    hooks,
    mcp,
    skillLoader,
    events,
    works,
    permissionPolicy,
    getConfig() {
      return config;
    },
    setActiveProvider(providerName: string, pConfig?: Partial<ProviderConfig>) {
      const lowerName = providerName.toLowerCase();
      config.llm.activeProvider = lowerName;

      if (pConfig) {
        config.llm.providers[lowerName] = {
          ...(config.llm.providers[lowerName] || {}),
          ...pConfig,
        };
      }

      saveConfig(config, options.configPath || "config.json");
      llm = createLLMFromConfig(config);
      agent = new Agent({
        llm,
        tools,
        memory,
        skills,
        contextBuilder,
        personalContextLoader,
        hooks,
        maxToolRounds: config.agent.maxToolRounds,
        onToolApproval: effectiveToolApproval,
      });
      context.agent = agent;
    },
    getStatus() {
      const currentSession = sessions.getCurrent();
      const messages = currentSession?.messages ?? [];
      const longTerm = memory.list("long_term");
      const sessionMem = memory.list("session");

      const estimatedHistoryLength = JSON.stringify(messages).length;
      const approxTokens = Math.ceil(estimatedHistoryLength / 3.5);

      const active = getActiveProviderConfig(config);
      const loadedPC = personalContextLoader.load();

      return {
        title: config.tui.title,
        llm: {
          provider: active.provider,
          model: active.config.model || "default",
          hasKey: Boolean(active.config.apiKey),
        },
        context: {
          maxTokens: config.context.maxTokens,
          mode: config.context.defaultMode,
          estimatedTokens: approxTokens,
          ratio: ((approxTokens / config.context.maxTokens) * 100).toFixed(1) + "%",
        },
        personalContext: {
          hasSoul: loadedPC.hasSoul,
          hasTelos: loadedPC.hasTelos,
          soulPath: config.personalContext?.soulPath,
          telosRoot: config.personalContext?.telosRoot,
          knowledgeRoot: config.personalContext?.knowledgeRoot,
          knowledgeWriteRoot: config.personalContext?.knowledgeWriteRoot,
        },
        memory: {
          longTermCount: longTerm.length,
          sessionCount: sessionMem.length,
          totalCount: memory.list().length,
        },
        session: {
          id: currentSession?.id ?? "-",
          title: currentSession?.title ?? "默认会话",
          messageCount: messages.length,
        },
        skills: skills.list().map((s) => s.name),
        tools: tools.list().map((t) => ({ name: t.name, permission: t.permission ?? "safe" })),
        paths: {
          dataDir: config.paths.dataDir,
          memoryFile: config.paths.memoryFile,
          sessionsDir: config.paths.sessionsDir,
        },
      };
    },
  };

  return context;
}
