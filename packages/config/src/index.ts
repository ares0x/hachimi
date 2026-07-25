// packages/config/src/index.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

export interface TelegramChannelConfig {
  botToken?: string;
  allowedUsers?: number[];
}

export interface ChannelsConfig {
  telegram?: TelegramChannelConfig;
  api?: {
    port?: number;
    secretKey?: string;
  };
  [key: string]: unknown;
}

export interface HachimiConfig {
  llm: {
    activeProvider: LLMProviderName;
    providers: Record<string, ProviderConfig>;
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
    theme: string;
    title: string;
  };
  channels?: ChannelsConfig;
}

export const DEFAULT_CONFIG: HachimiConfig = {
  llm: {
    activeProvider: "mock",
    providers: {
      mock: { apiKey: "mock-key", model: "mock-model" },
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        model: "deepseek-v4-flash",
        baseURL: "https://api.deepseek.com",
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || "",
        model: "gpt-5.6-luna",
        baseURL: "https://api.openai.com/v1",
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || "",
        model: "claude-opus-4-8",
        baseURL: "https://api.anthropic.com",
      },
    },
  },
  paths: {
    dataDir: resolve("data"),
    memoryFile: resolve("data", "memory.json"),
    sessionsDir: resolve("data", "sessions"),
  },
  agent: {
    maxToolRounds: 5,
  },
  context: {
    maxTokens: 12000,
    summaryThreshold: 10000,
    defaultMode: "normal",
    enableTokenTruncation: true,
  },
  tui: {
    theme: "amber",
    title: "Hachimi Agent Terminal",
  },
  channels: {
    api: {
      port: 3700,
    },
  },
};

/**
 * 加载配置（支持 config.json、环境变量及向后兼容补全）
 */
export function loadConfig(configPath = "config.json"): HachimiConfig {
  let loaded: Partial<HachimiConfig> = {};

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      loaded = JSON.parse(raw);
    } catch {
      /* ignore read errors */
    }
  }

  const activeProvider = (
    process.env.HACHIMI_PROVIDER_OVERRIDE ||
    process.env.LLM_PROVIDER ||
    loaded.llm?.activeProvider ||
    (loaded.llm as any)?.provider ||
    DEFAULT_CONFIG.llm.activeProvider
  ).toLowerCase();

  const cfg: HachimiConfig = {
    ...DEFAULT_CONFIG,
    ...loaded,
    llm: {
      ...DEFAULT_CONFIG.llm,
      ...loaded.llm,
      activeProvider,
      providers: {
        ...DEFAULT_CONFIG.llm.providers,
        ...(loaded.llm?.providers || {}),
      },
    },
    paths: {
      dataDir: resolve(loaded.paths?.dataDir || DEFAULT_CONFIG.paths.dataDir),
      memoryFile: resolve(loaded.paths?.dataDir || DEFAULT_CONFIG.paths.dataDir, "memory.json"),
      sessionsDir: resolve(loaded.paths?.dataDir || DEFAULT_CONFIG.paths.dataDir, "sessions"),
    },
    context: {
      ...DEFAULT_CONFIG.context,
      ...(loaded.context || {}),
    },
    agent: {
      ...DEFAULT_CONFIG.agent,
      ...(loaded.agent || {}),
    },
    tui: {
      ...DEFAULT_CONFIG.tui,
      ...(loaded.tui || {}),
    },
    channels: {
      ...DEFAULT_CONFIG.channels,
      ...(loaded.channels || {}),
    },
  };

  // 保证旧版平铺配置参数兼容落入 providers
  const rawLlm = (loaded.llm || {}) as Record<string, any>;
  if (rawLlm.deepseekApiKey) {
    cfg.llm.providers.deepseek = {
      ...cfg.llm.providers.deepseek,
      apiKey: rawLlm.deepseekApiKey,
      model: rawLlm.deepseekModel || cfg.llm.providers.deepseek?.model,
      baseURL: rawLlm.deepseekBaseURL || cfg.llm.providers.deepseek?.baseURL,
    };
  }
  if (rawLlm.openaiApiKey) {
    cfg.llm.providers.openai = {
      ...cfg.llm.providers.openai,
      apiKey: rawLlm.openaiApiKey,
      model: rawLlm.openaiModel || cfg.llm.providers.openai?.model,
      baseURL: rawLlm.openaiBaseURL || cfg.llm.providers.openai?.baseURL,
    };
  }

  return cfg;
}

/**
 * 保存配置到本地 config.json 文件
 */
export function saveConfig(cfg: HachimiConfig, configPath = "config.json"): void {
  try {
    const cleanProviders: Record<string, ProviderConfig> = {};
    for (const [pKey, pVal] of Object.entries(cfg.llm.providers)) {
      if (pKey === cfg.llm.activeProvider || Boolean(pVal.apiKey)) {
        const cleanP: ProviderConfig = {};
        if (pVal.apiKey) cleanP.apiKey = pVal.apiKey;
        if (pVal.model) cleanP.model = pVal.model;
        if (pVal.baseURL) cleanP.baseURL = pVal.baseURL;
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
      channels: cfg.channels,
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
