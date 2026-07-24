// packages/config/src/index.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export type LLMProviderName =
  | "mock"
  | "openai"
  | "deepseek"
  | "anthropic"
  | "claude"
  | "qwen"
  | "moonshot"
  | "ollama"
  | string;

export interface ContextConfig {
  maxTokens: number;
  summaryThreshold: number;
  defaultMode: "fast" | "normal" | "thoughtful";
  enableTokenTruncation: boolean;
}

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  customHeaders?: Record<string, string>;
  extraParams?: Record<string, unknown>;
}

export interface HachimiConfig {
  llm: {
    activeProvider: LLMProviderName;
    providers: Record<string, ProviderConfig>;
    /** 向后兼容字段 */
    provider?: LLMProviderName;
    apiKey?: string;
    model?: string;
    baseURL?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    openaiBaseURL?: string;
    deepseekApiKey?: string;
    deepseekModel?: string;
    deepseekBaseURL?: string;
    anthropicApiKey?: string;
    anthropicModel?: string;
    anthropicBaseURL?: string;
  };
  paths: {
    dataDir: string;
    memoryFile: string;
    sessionsDir: string;
  };
  agent: {
    maxToolRounds: number;
  };
  context: ContextConfig;
  tui: {
    title: string;
  };
}

/** 预置各主流 Provider 的专属环境变量级联默认配置 */
function buildEnvDefaultProviders(): Record<string, ProviderConfig> {
  return {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219",
      baseURL: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
    },
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219",
      baseURL: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
    },
    qwen: {
      apiKey: process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY,
      model: process.env.QWEN_MODEL || "qwen-max",
      baseURL: process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    moonshot: {
      apiKey: process.env.MOONSHOT_API_KEY,
      model: process.env.MOONSHOT_MODEL || "moonshot-v1-8k",
      baseURL: process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1",
    },
    mock: {
      apiKey: "mock-key",
      model: "mock-model",
    },
  };
}

const defaultConfig: HachimiConfig = {
  llm: {
    activeProvider: (process.env.LLM_PROVIDER as LLMProviderName) || "mock",
    providers: buildEnvDefaultProviders(),
  },
  paths: {
    dataDir: process.env.HACHIMI_DATA_DIR || resolve("data"),
    memoryFile: process.env.HACHIMI_MEMORY_FILE || resolve("data/memory.json"),
    sessionsDir: process.env.HACHIMI_SESSIONS_DIR || resolve("data/sessions"),
  },
  agent: {
    maxToolRounds: Number(process.env.HACHIMI_MAX_TOOL_ROUNDS || 5),
  },
  context: {
    maxTokens: Number(process.env.HACHIMI_CONTEXT_MAX_TOKENS || 12000),
    summaryThreshold: Number(process.env.HACHIMI_SUMMARY_THRESHOLD || 25),
    defaultMode: (process.env.HACHIMI_CONTEXT_MODE as "fast" | "normal" | "thoughtful") || "normal",
    enableTokenTruncation: process.env.HACHIMI_ENABLE_TOKEN_TRUNCATION !== "false",
  },
  tui: {
    title: "hachimi",
  },
};

/**
 * 加载配置（级联查找：内置默认值 < 环境变量 < config.json 覆盖）
 */
export function loadConfig(configPath = "config.json"): HachimiConfig {
  const cfg: HachimiConfig = structuredClone(defaultConfig);

  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      if (raw.llm) {
        if (raw.llm.activeProvider) {
          cfg.llm.activeProvider = raw.llm.activeProvider;
        } else if (raw.llm.provider) {
          cfg.llm.activeProvider = raw.llm.provider;
        }

        if (raw.llm.providers) {
          for (const [pKey, pVal] of Object.entries(raw.llm.providers)) {
            cfg.llm.providers[pKey] = {
              ...cfg.llm.providers[pKey],
              ...(pVal as ProviderConfig),
            };
          }
        }

        // 向后兼容旧格式平铺字段的迁移点
        if (raw.llm.deepseekApiKey || raw.llm.deepseekModel) {
          cfg.llm.providers.deepseek = {
            ...cfg.llm.providers.deepseek,
            ...(raw.llm.deepseekApiKey ? { apiKey: raw.llm.deepseekApiKey } : {}),
            ...(raw.llm.deepseekModel ? { model: raw.llm.deepseekModel } : {}),
            ...(raw.llm.deepseekBaseURL ? { baseURL: raw.llm.deepseekBaseURL } : {}),
          };
        }
        if (raw.llm.openaiApiKey || raw.llm.openaiModel) {
          cfg.llm.providers.openai = {
            ...cfg.llm.providers.openai,
            ...(raw.llm.openaiApiKey ? { apiKey: raw.llm.openaiApiKey } : {}),
            ...(raw.llm.openaiModel ? { model: raw.llm.openaiModel } : {}),
            ...(raw.llm.openaiBaseURL ? { baseURL: raw.llm.openaiBaseURL } : {}),
          };
        }
        if (raw.llm.anthropicApiKey || raw.llm.anthropicModel) {
          cfg.llm.providers.anthropic = {
            ...cfg.llm.providers.anthropic,
            ...(raw.llm.anthropicApiKey ? { apiKey: raw.llm.anthropicApiKey } : {}),
            ...(raw.llm.anthropicModel ? { model: raw.llm.anthropicModel } : {}),
            ...(raw.llm.anthropicBaseURL ? { baseURL: raw.llm.anthropicBaseURL } : {}),
          };
        }
      }

      if (raw.paths) {
        cfg.paths.dataDir = raw.paths.dataDir || cfg.paths.dataDir;
        cfg.paths.memoryFile = resolve(cfg.paths.dataDir, "memory.json");
        cfg.paths.sessionsDir = resolve(cfg.paths.dataDir, "sessions");
      }
      if (raw.agent) Object.assign(cfg.agent, raw.agent);
      if (raw.context) Object.assign(cfg.context, raw.context);
      if (raw.tui) Object.assign(cfg.tui, raw.tui);
    } catch (err) {
      console.warn("[config] 读取 config.json 失败，使用默认配置", err);
    }
  }

  // 保证向后兼容属性的动态映射
  cfg.llm.provider = cfg.llm.activeProvider;
  const activeP = cfg.llm.providers[cfg.llm.activeProvider] || {};
  cfg.llm.apiKey = activeP.apiKey;
  cfg.llm.model = activeP.model;
  cfg.llm.baseURL = activeP.baseURL;

  return cfg;
}

/**
 * 保存配置到本地 config.json 文件 (仅保存 activeProvider 或有有效 apiKey 的 Provider)
 */
export function saveConfig(cfg: HachimiConfig, configPath = "config.json"): void {
  try {
    const cleanProviders: Record<string, ProviderConfig> = {};
    for (const [pKey, pVal] of Object.entries(cfg.llm.providers)) {
      // 仅保留已被激活，或者具有显式 apiKey 的 Provider 节点
      if (pKey === cfg.llm.activeProvider || Boolean(pVal.apiKey)) {
        const cleanP: ProviderConfig = {};
        if (pVal.apiKey) cleanP.apiKey = pVal.apiKey;
        if (pVal.model) cleanP.model = pVal.model;
        if (pVal.baseURL) cleanP.baseURL = pVal.baseURL;
        if (pVal.customHeaders && Object.keys(pVal.customHeaders).length > 0) cleanP.customHeaders = pVal.customHeaders;
        if (pVal.extraParams && Object.keys(pVal.extraParams).length > 0) cleanP.extraParams = pVal.extraParams;

        cleanProviders[pKey] = cleanP;
      }
    }

    const toSave = {
      llm: {
        activeProvider: cfg.llm.activeProvider,
        providers: cleanProviders,
      },
      paths: {
        dataDir: cfg.paths.dataDir === resolve("data") ? "data" : cfg.paths.dataDir,
      },
      agent: cfg.agent,
      context: cfg.context,
      tui: cfg.tui,
    };
    writeFileSync(configPath, JSON.stringify(toSave, null, 2), "utf-8");
  } catch (err) {
    console.error("[config] 保存 config.json 失败", err);
  }
}

/** 获取当前激活的 Provider 专属配置 */
export function getActiveProviderConfig(cfg: HachimiConfig): {
  provider: string;
  config: ProviderConfig;
} {
  const provider = cfg.llm.activeProvider || "mock";
  const pConfig = cfg.llm.providers[provider] || {
    apiKey: "",
    model: "default",
  };
  return { provider, config: pConfig };
}
