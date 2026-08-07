import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  DAEMON_DEFAULT_PORT,
  DEFAULT_MAX_CONCURRENT_SUBAGENTS,
  DEFAULT_MAX_TOOL_ROUNDS,
  DEFAULT_TOKEN_BUDGET,
} from "@hachimi/shared";
import { normalizePermissionRules, type PermissionRulesConfig } from "./permission-rules.js";

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
  maxContextTokens?: number;
  /** Source of the model list: catalog fallback, dynamic fetch, or user override. */
  modelSource?: "static_catalog" | "fetched" | "user_override";
  /** ISO timestamp of the last successful dynamic model fetch. */
  modelsFetchedAt?: string;
  /** Last connection-test outcome. */
  lastTestStatus?:
    | "untested"
    | "ok"
    | "auth"
    | "rate_limit"
    | "provider_unavailable"
    | "timeout"
    | "network"
    | "unknown";
  lastTestAt?: string;
  lastTestMessage?: string;
  /**
   * 显式覆盖：该连接下的模型是否支持图片输入（vision）。
   * 未设置时按模型 id（catalog 能力元数据 + 关键词提示）自动判定。
   */
  supportsVision?: boolean;
  /**
   * 服务端联网搜索（DeepSeek Responses API web_search）：
   * 由模型服务商在服务端执行搜索并注入回答，无需本地搜索 Key。
   * 当前仅 DeepSeek 官方连接（baseUrl https://api.deepseek.com）生效，
   * 开启后传输层切换到 Responses API，并抑制本地 web_search 内置工具。
   */
  serverWebSearch?: boolean;
  /** ACP client: external agent executable (e.g. "codex", "claude"). */
  command?: string;
  /** ACP client: extra argv passed to the executable. */
  commandArgs?: string[];
  /** ACP client: working directory for the external agent session. */
  cwd?: string;
  /** ACP client: auto-approve external agent permission requests (default false). */
  autoApprovePermissions?: boolean;
  /** ACP client: start a fresh external session per turn (default false). */
  separateSession?: boolean;
}

/**
 * 视觉协助（"模型的眼睛"）：为不具备多模态能力的主模型指定一个
 * 视觉模型来理解图片。默认关闭；配置 connectionId+modelId 后按需启用。
 */
export interface VisionCompanionConfig {
  /** 总开关；未配置时默认 false（配置了 connectionId 则自动视为 true） */
  enabled?: boolean;
  /** 视觉协助连接 id（缺省时自动选择第一个含 vision 模型的可用连接） */
  connectionId?: string;
  /** 视觉协助模型 id（缺省时取该连接第一个 vision 模型） */
  modelId?: string;
  /** 超过该字节数的图片先压缩/降采样再发送（默认 5MB） */
  maxImageBytes?: number;
  /** 覆盖发送给视觉模型的描述提示词 */
  descriptionPrompt?: string;
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

/** MCP Server 配置（持久化于 config.json，启动时由 HarnessRuntime 拉起并注册工具） */
export interface McpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /**
   * 环境变量 → 凭据引用（`<slug>:<kind>`），如 `GITHUB_TOKEN: "github:api_key"`。
   * 启动时从凭据库解析并合并进 env；显式 env 值优先。
   */
  envCredentials?: Record<string, string>;
  url?: string;
  enabled?: boolean;
  permission?: "safe" | "needs_confirm" | "dangerous";
}

export interface HachimiConfig {
  llm: {
    activeConnectionId?: string;
    /** @deprecated — use activeConnectionId */
    activeProvider?: LLMProviderName;
    connections?: Record<string, LlmConnection>;
    /** @deprecated — use connections instead */
    providers?: Record<string, ProviderConfig>;
    /** 视觉协助（"模型的眼睛"）配置 */
    vision?: VisionCompanionConfig;
  };
  paths: {
    dataDir: string;
    memoryFile: string;
    sessionsDir: string;
  };
  personalContext?: PersonalContextConfig;
  mcpServers?: Record<string, McpServerEntry>;
  agent: {
    maxToolRounds: number;
    /** P2-B6: 自动模型路由（轻/重模型 + reasoning effort） */
    autoModelRouting?: {
      enabled?: boolean;
      fastModelId?: string;
      proModelId?: string;
      fastModelKeywords?: string[];
      proModelKeywords?: string[];
      longPromptThreshold?: number;
      proReasoningEffort?: "low" | "medium" | "high";
    };
    /** P2-B3: 工具门控（load_tools）— 启用后仅公布未分组工具与已激活分组 */
    toolGating?: {
      enabled?: boolean;
      defaultGroups?: string[];
    };
    /** P2.3: 延迟工具注入 — 每轮只公布核心工具 + 本轮已用工具（token 经济） */
    deferredToolInjection?: {
      enabled?: boolean;
    };
    /** P1: 子代理调度（并发上限 / 每父会话派发上限） */
    subAgents?: {
      /** 最大并行运行中的子代理数，超额排队等待（默认 4） */
      maxConcurrent?: number;
      /** 每个父会话累计可派发的子代理总数上限（默认不限制） */
      maxChildRunsPerParent?: number;
    };
  };
  context: ContextConfig;
  tui: {
    theme: string;
    title: string;
  };
  channels?: ChannelsConfig;
  /** P0-4: 权限规则（deny/ask/allow 工具规则 + 危险命令列表） */
  permissionRules?: {
    deny?: string[];
    ask?: string[];
    allow?: string[];
    dangerousCommands?: string[];
  };
  /** V1.3: 个人知识库（记忆→收件箱提纯等） */
  knowledge?: {
    distillation?: KnowledgeDistillationConfig;
  };
}

export interface KnowledgeDistillationConfig {
  /** 总开关（默认 true） */
  enabled?: boolean;
  /** 至少多少轮用户消息才值得提纯（默认 6） */
  minUserTurns?: number;
  /** 会话空闲多少小时后视为「已结束」（默认 2） */
  idleHours?: number;
  /** 两次扫描的最小间隔（默认 30 分钟，毫秒） */
  minScanIntervalMs?: number;
  /** 单次扫描最多生成几份草稿（默认 2） */
  maxDraftsPerScan?: number;
  /** 参与提纯的最近消息数上限（默认 40） */
  maxContextMessages?: number;
  /** 覆盖 knowledgeWriteRoot 的收件箱根（测试/自定义） */
  inboxDir?: string;
}

export type { PermissionRulesConfig } from "./permission-rules.js";
export { normalizePermissionRules } from "./permission-rules.js";

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
      c.enabled &&
      (Boolean(c.apiKey) ||
        c.providerType === "mock" ||
        c.providerType === "ollama" ||
        (c.providerType === "acp" && Boolean(c.command || c.baseUrl)))
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
    // No default active connection — first-run UX guides the user to configure one.
    activeConnectionId: undefined,
    connections: {
      mock: {
        id: "mock",
        name: "Mock LLM (开发模式)",
        providerType: "mock",
        enabled: false,
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
    dataDir: resolve(homedir(), ".hachimi", "data"),
    memoryFile: resolve(homedir(), ".hachimi", "data", "memory.json"),
    sessionsDir: resolve(homedir(), ".hachimi", "data", "sessions"),
  },
  personalContext: {
    soulPath: resolve(homedir(), ".hachimi", "SOUL.md"),
    telosRoot: resolve(homedir(), ".hachimi", "telos"),
    knowledgeRoot: resolve(homedir(), ".hachimi", "second-brain"),
    knowledgeWriteRoot: resolve(homedir(), ".hachimi", "second-brain", "_inbox"),
  },
  agent: {
    maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
    autoModelRouting: {
      enabled: false,
    },
    toolGating: {
      enabled: false,
      defaultGroups: [],
    },
    deferredToolInjection: {
      enabled: false,
    },
    subAgents: {
      maxConcurrent: DEFAULT_MAX_CONCURRENT_SUBAGENTS,
    },
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
  mcpServers: {},
};

export function ensureUserHachimiDir(): string {
  const userDir = resolve(homedir(), ".hachimi");
  try {
    const dirs = [
      userDir,
      resolve(userDir, "data"),
      resolve(userDir, "data", "sessions"),
      resolve(userDir, "data", "events"),
      resolve(userDir, "data", "works"),
      resolve(userDir, "data", "runs"),
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
    ""
  ).toLowerCase();

  const defaultDataDir = resolve(homedir(), ".hachimi", "data");

  /**
   * Guard: reject stale dataDir values written by old test runs or dev defaults.
   * - Anything containing "data-test" is a test fixture path, never a production data dir.
   * - Bare relative paths like "data" resolve to CWD which is wrong for an installed app.
   */
  const savedDataDir = loaded.paths?.dataDir;
  const isStaleDataDir =
    !savedDataDir ||
    savedDataDir.includes("data-test") ||
    savedDataDir === "data" ||
    savedDataDir === resolve("data");

  const effectiveDataDir =
    process.env.VITEST || process.env.NODE_ENV === "test"
      ? resolve("data-test")
      : isStaleDataDir
        ? defaultDataDir
        : savedDataDir;

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
    mcpServers: {
      ...(DEFAULT_CONFIG.mcpServers || {}),
      ...(loaded.mcpServers || {}),
    },
    permissionRules: normalizePermissionRules(loaded.permissionRules),
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
          serverWebSearch: cVal.serverWebSearch,
        };
      }
    }

    const userHomeConfig = resolve(homedir(), ".hachimi", "config.json");
    const targetPath =
      configPath === "config.json" && !existsSync("config.json") && existsSync(userHomeConfig)
        ? userHomeConfig
        : configPath;

    const defaultDataDir = resolve(homedir(), ".hachimi", "data");
    const isCustomDataDir =
      cfg.paths?.dataDir &&
      cfg.paths.dataDir !== defaultDataDir &&
      !cfg.paths.dataDir.includes("data-test");

    const toSave: Record<string, unknown> = {
      llm: {
        activeConnectionId: cfg.llm.activeConnectionId,
        connections: cleanConnections,
      },
      ...(isCustomDataDir ? { paths: { dataDir: cfg.paths.dataDir } } : {}),
      personalContext: cfg.personalContext,
      mcpServers: cfg.mcpServers,
      agent: cfg.agent,
      context: cfg.context,
      tui: cfg.tui,
      channels: cfg.channels,
      permissionRules: cfg.permissionRules,
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
export {
  type ConnectionTestResult,
  fetchConnectionModels,
  testConnection,
} from "./connection-tester.js";
export {
  CREDENTIAL_KIND_LABELS,
  CREDENTIAL_KINDS,
  type CredentialKind,
  CredentialStore,
  getDefaultCredentialStore,
  maskApiKey,
  resetDefaultCredentialStore,
  resolveCredentialReference,
  type SecretCipher,
} from "./credential-store.js";
export {
  type CatalogModel,
  type CatalogProvider,
  PROVIDER_CATALOG,
  resolveContextPromptBudget,
  resolveModelContextWindow,
} from "./provider-catalog.js";
export {
  isVisionModelId,
  pickVisionModel,
  VISION_MODEL_HINTS,
  type VisionCapableConnection,
} from "./vision.js";
