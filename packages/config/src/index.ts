import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export type LLMProviderName = "mock" | "openai" | "deepseek";

export interface HachimiConfig {
  llm: {
    provider: LLMProviderName;
    openaiApiKey?: string;
    openaiModel: string;
    deepseekApiKey?: string;
    deepseekModel: string;
    deepseekBaseURL: string;
  };
  paths: {
    dataDir: string;
    memoryFile: string;
    sessionsDir: string;
  };
  agent: {
    maxToolRounds: number;
  };
  tui: {
    title: string;
  };
}

const defaultConfig: HachimiConfig = {
  llm: {
    provider: (process.env.LLM_PROVIDER as LLMProviderName) || "mock",
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    deepseekBaseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  },
  paths: {
    dataDir: process.env.HACHIMI_DATA_DIR || resolve("data"),
    memoryFile: process.env.HACHIMI_MEMORY_FILE || resolve("data/memory.json"),
    sessionsDir: process.env.HACHIMI_SESSIONS_DIR || resolve("data/sessions"),
  },
  agent: {
    maxToolRounds: Number(process.env.HACHIMI_MAX_TOOL_ROUNDS || 5),
  },
  tui: {
    title: "hachimi",
  },
};

/**
 * 加载配置。
 * 优先级：默认值 < 可选 config.json < 环境变量（环境变量已在 default 中读取）
 */
export function loadConfig(configPath = "config.json"): HachimiConfig {
  const cfg: HachimiConfig = structuredClone(defaultConfig);

  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      Object.assign(cfg.llm, raw.llm ?? {});
      Object.assign(cfg.paths, raw.paths ?? {});
      Object.assign(cfg.agent, raw.agent ?? {});
      Object.assign(cfg.tui, raw.tui ?? {});
    } catch (err) {
      console.warn("[config] 读取 config.json 失败，使用默认配置", err);
    }
  }

  return cfg;
}

function repoRoot() {
  // 从 apps/tui 启动时，cwd 可能是 apps/tui；允许用环境变量覆盖
  return process.env.HACHIMI_ROOT || resolve(process.cwd(), "../..");
}
