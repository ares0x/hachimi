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
  enabled?: boolean;
  apiKey?: string;
  model?: string;
  baseURL?: string;
  customHeaders?: Record<string, string>;
  extraParams?: Record<string, unknown>;
  models?: string[];
  enabledModels?: string[];
}

export interface LlmConnection {
  id: string;
  name: string;
  providerType:
    | "openai"
    | "deepseek"
    | "anthropic"
    | "ollama"
    | "openai-compatible"
    | "mock"
    | string;
  baseUrl?: string;
  apiKey?: string;
  enabled: boolean;
  defaultModelId: string;
  models: string[];
  enabledModels: string[];
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

export interface PersonalContextConfig {
  soulPath?: string;
  telosRoot?: string;
  knowledgeRoot?: string;
  knowledgeWriteRoot?: string;
}

export interface HachimiConfig {
  llm: {
    activeConnectionId?: string;
    /** @deprecated — use activeConnectionId */
    activeProvider?: LLMProviderName;
    connections?: Record<string, LlmConnection>;
    /** @deprecated — use connections instead */
    providers?: Record<string, ProviderConfig>;
  };
  paths: {
    dataDir: string;
    memoryFile: string;
    sessionsDir: string;
  };
  personalContext?: PersonalContextConfig;
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

export interface LlmSelection {
  connectionId: string;
  providerType: string;
  modelId: string;
  connection?: LlmConnection;
}

export function resolveLlmSelection(
  cfg: HachimiConfig,
  overrides?: { connectionId?: string; modelId?: string; provider?: string; model?: string }
): LlmSelection {
  const connections = cfg.llm.connections || {};
  const connectionList = Object.values(connections);

  if (overrides?.connectionId && connections[overrides.connectionId]) {
    const conn = connections[overrides.connectionId];
    return {
      connectionId: conn.id,
      providerType: conn.providerType,
      modelId: overrides.modelId || conn.defaultModelId,
      connection: conn,
    };
  }

  const activeConnId = cfg.llm.activeConnectionId;
  if (activeConnId && connections[activeConnId]) {
    const conn = connections[activeConnId];
    return {
      connectionId: conn.id,
      providerType: conn.providerType,
      modelId: overrides?.modelId || conn.defaultModelId,
      connection: conn,
    };
  }

  const readyConn = connectionList.find(
    (c) =>
      c.enabled && (Boolean(c.apiKey) || c.providerType === "mock" || c.providerType === "ollama")
  );
  if (readyConn) {
    return {
      connectionId: readyConn.id,
      providerType: readyConn.providerType,
      modelId: overrides?.modelId || readyConn.defaultModelId,
      connection: readyConn,
    };
  }

  const activeP = cfg.llm.activeProvider || "mock";
  const pCfg = cfg.llm.providers?.[activeP] || { model: "default" };
  return {
    connectionId: activeP,
    providerType: activeP,
    modelId: overrides?.modelId || pCfg.model || "default",
  };
}

export const DEFAULT_CONFIG: HachimiConfig = {
  llm: {
    activeConnectionId: "mock",
    connections: {
      mock: {
        id: "mock",
        name: "Mock LLM",
        providerType: "mock",
        enabled: true,
        apiKey: "mock-key",
        defaultModelId: "mock-model",
        models: ["mock-model"],
        enabledModels: ["mock-model"],
      },
      deepseek: {
        id: "deepseek",
        name: "DeepSeek Official",
        providerType: "deepseek",
        enabled: true,
        baseUrl: "https://api.deepseek.com",
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        defaultModelId: "deepseek-v4-flash",
        models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
        enabledModels: [
          "deepseek-v4-flash",
          "deepseek-v4-pro",
          "deepseek-chat",
          "deepseek-reasoner",
        ],
      },
      openai: {
        id: "openai",
        name: "OpenAI Official",
        providerType: "openai",
        enabled: true,
        baseUrl: "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY || "",
        defaultModelId: "gpt-4o",
        models: ["gpt-4o", "gpt-4o-mini", "o1-mini", "o3-mini", "gpt-4-turbo"],
        enabledModels: ["gpt-4o", "gpt-4o-mini"],
      },
      anthropic: {
        id: "anthropic",
        name: "Anthropic Claude",
        providerType: "anthropic",
        enabled: true,
        baseUrl: "https://api.anthropic.com",
        apiKey: process.env.ANTHROPIC_API_KEY || "",
        defaultModelId: "claude-3-7-sonnet",
        models: ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"],
        enabledModels: ["claude-3-7-sonnet", "claude-3-5-sonnet"],
      },
      ollama: {
        id: "ollama",
        name: "Ollama (Local)",
        providerType: "ollama",
        enabled: false,
        baseUrl: "http://localhost:11434/v1",
        apiKey: "ollama",
        defaultModelId: "qwen2.5-coder",
        models: ["qwen2.5-coder", "llama3.3", "deepseek-r1:8b", "mistral"],
        enabledModels: ["qwen2.5-coder", "llama3.3"],
      },
    },
  },
  paths: {
    dataDir: resolve("data"),
    memoryFile: resolve("data", "memory.json"),
    sessionsDir: resolve("data", "sessions"),
  },
  personalContext: {
    soulPath: resolve(homedir(), ".hachimi", "SOUL.md"),
    telosRoot: resolve(homedir(), ".hachimi", "telos"),
    knowledgeRoot: resolve(homedir(), ".hachimi", "second-brain"),
    knowledgeWriteRoot: resolve(homedir(), ".hachimi", "second-brain", "_inbox"),
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
    loaded.llm?.activeConnectionId ||
    (loaded.llm as any)?.provider ||
    DEFAULT_CONFIG.llm.activeConnectionId ||
    "mock"
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
      activeConnectionId: loaded.llm?.activeConnectionId || activeProvider,
      connections: {
        ...(DEFAULT_CONFIG.llm.connections || {}),
        ...(loaded.llm?.connections || {}),
      },
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
    personalContext: {
      ...DEFAULT_CONFIG.personalContext,
      ...(loaded.personalContext || {}),
    },
  };

  // Ensure connections is initialized
  if (!cfg.llm.connections) cfg.llm.connections = {};

  return cfg;
}

/**
 * 保存配置到本地 config.json 文件
 */
export function saveConfig(cfg: HachimiConfig, configPath = "config.json"): void {
  try {
    const cleanConnections: Record<string, LlmConnection> = {};
    if (cfg.llm.connections) {
      for (const [cKey, cVal] of Object.entries(cfg.llm.connections)) {
        cleanConnections[cKey] = {
          id: cVal.id,
          name: cVal.name,
          providerType: cVal.providerType,
          enabled: cVal.enabled,
          baseUrl: cVal.baseUrl,
          apiKey: "", // never persist API keys in config — use credential store
          defaultModelId: cVal.defaultModelId,
          models: cVal.models,
          enabledModels: cVal.enabledModels,
        };
      }
    }

    const userHomeConfig = resolve(homedir(), ".hachimi", "config.json");
    const targetPath =
      configPath === "config.json" && !existsSync("config.json") && existsSync(userHomeConfig)
        ? userHomeConfig
        : configPath;

    const toSave = {
      llm: {
        activeConnectionId: cfg.llm.activeConnectionId,
        connections: cleanConnections,
      },
      paths: {
        dataDir: cfg.paths.dataDir === resolve("data") ? "data" : cfg.paths.dataDir,
      },
      personalContext: cfg.personalContext,
      agent: cfg.agent,
      context: cfg.context,
      tui: cfg.tui,
      channels: cfg.channels,
    };
    writeFileSync(targetPath, JSON.stringify(toSave, null, 2), "utf-8");
  } catch (err) {
    console.error("[config] 保存 config.json 失败", err);
  }
}

/**
 * @deprecated — use resolveLlmSelection instead.
 * Kept for backward compat with existing callers during migration.
 */
export function getActiveProviderConfig(cfg: HachimiConfig): {
  provider: string;
  config: ProviderConfig;
} {
  const provider = cfg.llm.activeProvider || cfg.llm.activeConnectionId || "mock";
  const pConfig = cfg.llm.providers?.[provider] || {
    apiKey: "",
    model: "default",
  };
  return { provider, config: pConfig };
}
export { CredentialStore, getDefaultCredentialStore, resetDefaultCredentialStore, maskApiKey } from "./credential-store.js";
