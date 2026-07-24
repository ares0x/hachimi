// apps/tui/src/app-context.ts
import { loadConfig, saveConfig, getActiveProviderConfig, type HachimiConfig, type ProviderConfig } from "@hachimi/config";
import { log } from "@hachimi/shared";
import { resolve } from "node:path";
import { FileJsonStore, FileDirStore } from "@hachimi/storage";
import { SQLiteStore } from "@hachimi/storage";
import { Agent } from "../../../packages/core/src/agent/agent.js";
import { ToolRegistry } from "../../../packages/core/src/tools/registry.js";
import { MemoryManager } from "../../../packages/core/src/memory/manager.js";
import { SessionManager } from "../../../packages/core/src/session/manager.js";
import { SkillRegistry } from "../../../packages/core/src/skills/registry.js";
import { writingSkill } from "../../../packages/core/src/skills/examples/writing.js";
import { summarySkill } from "../../../packages/core/src/skills/examples/summary.js";
import { MockLLMProvider } from "../../../packages/core/src/agent/llm.js";
import { ProviderRegistry } from "../../../packages/core/src/agent/providers/transport.ts";
import { ContextBuilder } from "../../../packages/core/src/context/builder.js";

export interface AppContext {
  config: HachimiConfig;
  memory: MemoryManager;
  sessions: SessionManager;
  tools: ToolRegistry;
  skills: SkillRegistry;
  agent: Agent;
  contextBuilder: ContextBuilder;
  getConfig(): HachimiConfig;
  setActiveProvider(provider: string, pConfig?: Partial<ProviderConfig>): void;
  getStatus(): Record<string, any>;
}

function createLLM(config: HachimiConfig) {
  const { provider, config: pConfig } = getActiveProviderConfig(config);

  if (provider === "mock") {
    log("info", "使用 MockLLMProvider");
    return new MockLLMProvider();
  }

  const apiKey = pConfig.apiKey;
  if (!apiKey) {
    log("warn", `未找到 ${provider} 的 API_KEY，回退到 MockLLMProvider`);
    return new MockLLMProvider();
  }

  log("info", `通过 ProviderRegistry 初始化模型传输层: [${provider}]`, {
    model: pConfig.model,
    baseURL: pConfig.baseURL,
  });

  return ProviderRegistry.create(provider, {
    apiKey,
    model: pConfig.model,
    baseURL: pConfig.baseURL,
    customHeaders: pConfig.customHeaders,
    extraParams: pConfig.extraParams,
  });
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
  onToolApproval?: (toolName: string, args: Record<string, unknown>, permission: string) => Promise<boolean>;
}

export function createAppContext(options: CreateAppContextOptions = {}): AppContext {
  let config = loadConfig();

  log("info", "hachimi starting", {
    provider: config.llm.activeProvider,
    dataDir: config.paths.dataDir,
    storage: "sqlite",
  });

  const useSQLite = true;

  let fileStore: any;
  let dirStore: any;

  if (useSQLite) {
    const sqlitePath = resolve(config.paths.dataDir, "hachimi.db");
    const sqliteStore = new SQLiteStore(sqlitePath);
    fileStore = sqliteStore;
    dirStore = sqliteStore;
    log("info", `使用 SQLite 存储: ${sqlitePath}`);
  } else {
    fileStore = new FileJsonStore();
    dirStore = new FileDirStore();
    log("info", "使用 File 存储（兼容模式）");
  }

  const memory = new MemoryManager(config.paths.memoryFile, fileStore);
  const sessions = new SessionManager(config.paths.sessionsDir, dirStore);

  const tools = new ToolRegistry();
  const skills = new SkillRegistry();

  skills.register(writingSkill);
  skills.register(summarySkill);

  registerBuiltinTools(tools);

  if (memory.list("long_term").length === 0) {
    memory.remember("用户的名字是小明，喜欢简洁的回答", 0.9);
    memory.remember("用户正在开发一个叫 hachimi 的个人助理项目", 0.85);
  }

  let llm = createLLM(config);
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

      llm = createLLM(config);
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
