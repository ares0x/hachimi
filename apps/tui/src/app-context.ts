// apps/tui/src/app-context.ts
import { loadConfig, type HachimiConfig } from "@hachimi/config";
import { log } from "@hachimi/shared";
import { resolve } from "node:path";                    // 新增：修复 resolve 错误
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
import { OpenAICompatibleProvider } from "../../../packages/core/src/agent/providers/openai-compatible.js";
import { ContextBuilder } from "../../../packages/core/src/context/builder.js";

export interface AppContext {
  config: HachimiConfig;
  memory: MemoryManager;
  sessions: SessionManager;
  tools: ToolRegistry;
  skills: SkillRegistry;
  agent: Agent;
  getStatus(): Record<string, any>;
}

function createLLM(config: HachimiConfig) {
  const provider = config.llm.provider;
  if (provider === "openai") {
    if (!config.llm.openaiApiKey) {
      throw new Error("OPENAI_API_KEY 未配置");
    }
    return new OpenAICompatibleProvider({
      apiKey: config.llm.openaiApiKey,
      model: config.llm.openaiModel,
    });
  }
  if (provider === "deepseek") {
    if (!config.llm.deepseekApiKey) {
      throw new Error("DEEPSEEK_API_KEY 未配置");
    }
    return new OpenAICompatibleProvider({
      apiKey: config.llm.deepseekApiKey,
      baseURL: config.llm.deepseekBaseURL,
      model: config.llm.deepseekModel,
    });
  }
  log("info", "使用 MockLLMProvider");
  return new MockLLMProvider();
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

export function createAppContext(): AppContext {
  const config = loadConfig();

  log("info", "hachimi starting", {
    provider: config.llm.provider,
    dataDir: config.paths.dataDir,
    storage: "sqlite",
  });

  // Storage 切换逻辑
  const useSQLite = true; // 后续可改为从 config.storage.backend 读取

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

  const llm = createLLM(config);
  const contextBuilder = new ContextBuilder();

  const agent = new Agent({
    llm,
    tools,
    memory,
    skills,
    contextBuilder,
    maxToolRounds: config.agent.maxToolRounds,
  });

  sessions.getOrCreate();
  const session = sessions.getCurrent();

  log("info", "session ready", {
    id: session?.id,
    messages: session?.messages.length ?? 0,
  });

  const context = {
      config,
      memory,
      sessions,
      tools,
      skills,
      agent,
      getStatus() {
        return {
          llm: config.llm.provider,
          context: {
            maxTokens: config.context.maxTokens,
            mode: config.context.defaultMode,
          },
          memory: {
            longTermCount: memory.list("long_term").length,
            sessionCount: memory.list("session").length,
          },
          session: {
            id: sessions.getCurrent()?.id,
            messages: sessions.getCurrent()?.messages.length ?? 0,
          },
          skills: skills.list().map(s => s.name),
        };
      },
    };

    return context;
}
