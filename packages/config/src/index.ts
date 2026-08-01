import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  DAEMON_DEFAULT_PORT,
  DEFAULT_MAX_TOOL_ROUNDS,
  DEFAULT_TOKEN_BUDGET,
} from "@hachimi/shared";

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
    maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
  },
  context: {
    maxTokens: DEFAULT_TOKEN_BUDGET,
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
      port: DAEMON_DEFAULT_PORT,
    },
  },
};

export function ensureUserHachimiDir(): string {
  const userDir = resolve(homedir(), ".hachimi");
  try {
    const dirs = [
      userDir,
      resolve(userDir, "skills"),
      resolve(userDir, "proposals"),
      resolve(userDir, "telos"),
      resolve(userDir, "second-brain", "_inbox"),
    ];

    for (const d of dirs) {
      if (!existsSync(d)) {
        mkdirSync(d, { recursive: true });
      }
    }

    const soulPath = resolve(userDir, "SOUL.md");
    if (!existsSync(soulPath)) {
      writeFileSync(
        soulPath,
        `# SOUL.md - Hachimi Personal Agent Persona & Boundaries\n- 保持专业、简洁、客观\n- 遵循本地优先原则，避免无授权执行危险写操作\n`,
        "utf-8"
      );
    }

    const missionPath = resolve(userDir, "telos", "MISSION.md");
    if (!existsSync(missionPath)) {
      writeFileSync(missionPath, `# Mission\n构建最强 local-first 个人 Agent Runtime。\n`, "utf-8");
    }

    const goalsPath = resolve(userDir, "telos", "GOALS.md");
    if (!existsSync(goalsPath)) {
      writeFileSync(goalsPath, `# Goals\n1. 极简高效交互\n2. 确定性沙箱隔离\n`, "utf-8");
    }

    const projectsPath = resolve(userDir, "telos", "PROJECTS.md");
    if (!existsSync(projectsPath)) {
      writeFileSync(projectsPath, `# Projects\n- Hachimi Harness Runtime\n`, "utf-8");
    }

    const userHomeConfig = resolve(userDir, "config.json");
    if (!existsSync(userHomeConfig) && !existsSync("config.json")) {
      writeFileSync(userHomeConfig, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
    }
  } catch (err) {
    /* ignore initialization error */
  }
  return userDir;
}

/**
 * 加载配置（支持 config.json、环境变量及向后兼容补全）
 */
export function loadConfig(configPath = "config.json"): HachimiConfig {
  ensureUserHachimiDir();
  let loaded: Partial<HachimiConfig> = {};

  const userHomeConfig = resolve(homedir(), ".hachimi", "config.json");
  const targetPath = existsSync(configPath)
    ? configPath
    : existsSync(userHomeConfig)
      ? userHomeConfig
      : configPath;

  if (existsSync(targetPath)) {
    try {
      const raw = readFileSync(targetPath, "utf-8");
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

  const effectiveDataDir =
    process.env.VITEST || process.env.NODE_ENV === "test"
      ? "data-test"
      : loaded.paths?.dataDir || "data";

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
      dataDir: resolve(effectiveDataDir),
      memoryFile: resolve(effectiveDataDir, "memory.json"),
      sessionsDir: resolve(effectiveDataDir, "sessions"),
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
      if (pKey === cfg.llm.activeProvider || pVal.apiKey) {
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
