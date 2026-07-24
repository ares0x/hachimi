// packages/core/src/runtime/context.ts
import { resolve } from "node:path";
import {
  type HachimiConfig,
  type ProviderConfig,
  getActiveProviderConfig,
  loadConfig,
  saveConfig,
} from "@hachimi/config";
import { log } from "@hachimi/shared";
import { FileDirStore, FileJsonStore, SQLiteStore } from "@hachimi/storage";
import { Agent } from "../agent/agent.js";
import { createLLMFromConfig } from "../agent/llm-factory.js";
import { ContextBuilder } from "../context/builder.js";
import { HookRegistry } from "../extensions/hooks.js";
import { McpClientManager } from "../extensions/mcp-client.js";
import { SkillPackageLoader } from "../extensions/skill-package.js";
import { MemoryManager } from "../memory/manager.js";
import { SessionManager } from "../session/manager.js";
import { summarySkill, writingSkill } from "../skills/builtin/index.js";
import { SkillRegistry } from "../skills/registry.js";
import { ToolRegistry } from "../tools/registry.js";

export interface AppContext {
  config: HachimiConfig;
  memory: MemoryManager;
  sessions: SessionManager;
  tools: ToolRegistry;
  skills: SkillRegistry;
  agent: Agent;
  contextBuilder: ContextBuilder;
  hooks: HookRegistry;
  mcp: McpClientManager;
  skillLoader: SkillPackageLoader;
  getConfig(): HachimiConfig;
  setActiveProvider(provider: string, pConfig?: Partial<ProviderConfig>): void;
  getStatus(): Record<string, any>;
}

function registerBuiltinTools(tools: ToolRegistry) {
  tools.register({
    name: "calculator",
    description: "执行简单的加减乘除计算",
    permission: "safe",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
        operator: { type: "string", enum: ["+", "-", "*", "/"] },
      },
      required: ["a", "b", "operator"],
    },
    async execute(args) {
      const { a, b, operator } = args as {
        a: number;
        b: number;
        operator: string;
      };
      switch (operator) {
        case "+":
          return String(a + b);
        case "-":
          return String(a - b);
        case "*":
          return String(a * b);
        case "/":
          return String(a / b);
        default:
          return "不支持的运算符";
      }
    },
  });
}

export interface CreateAppContextOptions {
  configPath?: string;
  configOverride?: Partial<HachimiConfig>;
  providerOverride?: string;
  onToolApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    permission: string
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
  const skills = new SkillRegistry();
  const hooks = new HookRegistry();
  const mcp = new McpClientManager();
  const skillLoader = new SkillPackageLoader();

  skills.register(writingSkill);
  skills.register(summarySkill);

  registerBuiltinTools(tools);

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

  let agent = new Agent({
    llm,
    tools,
    memory,
    skills,
    contextBuilder,
    maxToolRounds: config.agent.maxToolRounds,
    onToolApproval: options.onToolApproval,
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
    hooks,
    mcp,
    skillLoader,
    getConfig() {
      return config;
    },
    setActiveProvider(provider: string, pConfig?: Partial<ProviderConfig>) {
      config.llm.activeProvider = provider;
      if (!config.llm.providers[provider]) {
        config.llm.providers[provider] = {};
      }
      if (pConfig) {
        Object.assign(config.llm.providers[provider], pConfig);
      }
      saveConfig(config);

      llm = createLLMFromConfig(config);
      agent = new Agent({
        llm,
        tools,
        memory,
        skills,
        contextBuilder,
        maxToolRounds: config.agent.maxToolRounds,
        onToolApproval: options.onToolApproval,
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
