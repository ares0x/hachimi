// packages/config/src/provider-catalog.ts
// Preset provider catalog: the single source of truth for "which providers can I add".
// A catalog entry is a template; users instantiate it into an LlmConnection.

import { DEFAULT_TOKEN_BUDGET } from "@hachimi/shared";

export type CatalogCategory = "domestic" | "overseas" | "local" | "custom";

export interface CatalogModel {
  id: string;
  label?: string;
  speed?: "fast" | "balanced" | "thorough";
  capabilities?: string[]; // e.g. ["vision", "reasoning", "tools"]
  recommended?: boolean;
  contextWindow?: number; // Official context window in tokens (Craft Agents / Maka pattern)
}

export interface CatalogProvider {
  id: string;
  label: string;
  description: string;
  category: CatalogCategory;
  /** Wire protocol / transport dialect (maps to core ProviderRegistry). */
  protocol: string;
  defaultBaseUrl?: string;
  requiresKey: boolean;
  /** Env vars auto-detected at connection creation time (first non-empty wins). */
  envKeys: string[];
  /** Deep link where the user can obtain an API key. */
  signupUrl?: string;
  /** Relative path for dynamic model listing (OpenAI-compatible style). */
  modelsPath?: string;
  /** Curated fallback list used when dynamic fetch fails or is not attempted. */
  fallbackModels: CatalogModel[];
  /** If true, hidden from the "add connection" catalog (dev/test only). */
  devOnly?: boolean;
}

export const PROVIDER_CATALOG: CatalogProvider[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek 官方 API，高性价比中文友好的通用与推理模型",
    category: "domestic",
    protocol: "deepseek",
    defaultBaseUrl: "https://api.deepseek.com",
    requiresKey: true,
    envKeys: ["DEEPSEEK_API_KEY"],
    signupUrl: "https://platform.deepseek.com/api_keys",
    modelsPath: "/models",
    fallbackModels: [
      {
        id: "deepseek-chat",
        label: "DeepSeek Chat",
        speed: "balanced",
        recommended: true,
        contextWindow: 128_000,
      },
      {
        id: "deepseek-reasoner",
        label: "DeepSeek Reasoner",
        speed: "thorough",
        capabilities: ["reasoning"],
        contextWindow: 128_000,
      },
    ],
  },
  {
    id: "moonshot",
    label: "Kimi (Moonshot)",
    description: "月之暗面 Kimi，长上下文见长",
    category: "domestic",
    protocol: "moonshot",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    requiresKey: true,
    envKeys: ["MOONSHOT_API_KEY"],
    signupUrl: "https://platform.moonshot.cn/console/api-keys",
    modelsPath: "/models",
    fallbackModels: [
      {
        id: "kimi-latest",
        label: "Kimi Latest",
        speed: "balanced",
        recommended: true,
        capabilities: ["vision"],
        contextWindow: 128_000,
      },
      { id: "moonshot-v1-8k", label: "Moonshot v1 8K", speed: "fast", contextWindow: 8_192 },
      {
        id: "moonshot-v1-32k",
        label: "Moonshot v1 32K",
        speed: "balanced",
        contextWindow: 32_768,
      },
      {
        id: "moonshot-v1-128k",
        label: "Moonshot v1 128K",
        speed: "thorough",
        contextWindow: 128_000,
      },
    ],
  },
  {
    id: "qwen",
    label: "Qwen (DashScope)",
    description: "阿里通义千问，DashScope 兼容模式接入",
    category: "domestic",
    protocol: "qwen",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    requiresKey: true,
    envKeys: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    signupUrl: "https://bailian.console.aliyun.com/",
    modelsPath: "/models",
    fallbackModels: [
      {
        id: "qwen-plus",
        label: "Qwen Plus",
        speed: "balanced",
        recommended: true,
        contextWindow: 128_000,
      },
      { id: "qwen-turbo", label: "Qwen Turbo", speed: "fast", contextWindow: 128_000 },
      { id: "qwen-max", label: "Qwen Max", speed: "thorough", contextWindow: 128_000 },
      { id: "qwen-long", label: "Qwen Long", speed: "balanced", contextWindow: 128_000 },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "OpenAI 官方 API（GPT 系列）",
    category: "overseas",
    protocol: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresKey: true,
    envKeys: ["OPENAI_API_KEY"],
    signupUrl: "https://platform.openai.com/api-keys",
    modelsPath: "/models",
    fallbackModels: [
      {
        id: "gpt-4o",
        label: "GPT-4o",
        speed: "balanced",
        capabilities: ["vision"],
        recommended: true,
        contextWindow: 128_000,
      },
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini",
        speed: "fast",
        capabilities: ["vision"],
        contextWindow: 128_000,
      },
      {
        id: "gpt-4-turbo",
        label: "GPT-4 Turbo",
        speed: "thorough",
        capabilities: ["vision"],
        contextWindow: 128_000,
      },
      {
        id: "o3-mini",
        label: "o3-mini",
        speed: "thorough",
        capabilities: ["reasoning"],
        contextWindow: 200_000,
      },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    description: "Anthropic 官方 API（Claude 系列）",
    category: "overseas",
    protocol: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    requiresKey: true,
    envKeys: ["ANTHROPIC_API_KEY"],
    signupUrl: "https://console.anthropic.com/settings/keys",
    modelsPath: "/v1/models",
    fallbackModels: [
      {
        id: "claude-3-7-sonnet",
        label: "Claude 3.7 Sonnet",
        speed: "balanced",
        recommended: true,
        capabilities: ["vision"],
        contextWindow: 200_000,
      },
      {
        id: "claude-3-5-sonnet",
        label: "Claude 3.5 Sonnet",
        speed: "balanced",
        capabilities: ["vision"],
        contextWindow: 200_000,
      },
      {
        id: "claude-3-5-haiku",
        label: "Claude 3.5 Haiku",
        speed: "fast",
        capabilities: ["vision"],
        contextWindow: 200_000,
      },
      {
        id: "claude-3-opus",
        label: "Claude 3 Opus",
        speed: "thorough",
        capabilities: ["vision"],
        contextWindow: 200_000,
      },
    ],
  },
  {
    id: "ollama",
    label: "Ollama (本地)",
    description: "本地 Ollama 服务，无需 API Key",
    category: "local",
    protocol: "ollama",
    defaultBaseUrl: "http://localhost:11434/v1",
    requiresKey: false,
    envKeys: [],
    modelsPath: "/models",
    fallbackModels: [
      {
        id: "qwen2.5-coder",
        label: "Qwen2.5 Coder",
        speed: "balanced",
        recommended: true,
        contextWindow: 32_768,
      },
      { id: "llama3.3", label: "Llama 3.3", speed: "balanced", contextWindow: 128_000 },
      { id: "deepseek-r1:8b", label: "DeepSeek R1 8B", speed: "thorough", contextWindow: 32_768 },
      { id: "mistral", label: "Mistral", speed: "fast", contextWindow: 32_768 },
    ],
  },
  {
    id: "openai-compatible",
    label: "自定义兼容端点",
    description: "OneAPI / NewAPI 中转站或任何 OpenAI 兼容 API",
    category: "custom",
    protocol: "openai-compatible",
    requiresKey: true,
    envKeys: [],
    modelsPath: "/models",
    fallbackModels: [],
  },
  {
    id: "acp",
    label: "ACP Agent (Codex / Claude / Grok)",
    description:
      "外部 Agent Harness：通过 stdio JSON-RPC（Agent Client Protocol v2）驱动 Codex / Claude Code 等作为模型提供方",
    category: "custom",
    protocol: "acp",
    requiresKey: false,
    envKeys: [],
    fallbackModels: [
      {
        id: "external-agent",
        label: "External Agent",
        speed: "balanced",
        recommended: true,
      },
    ],
  },
  {
    id: "mock",
    label: "Mock (开发测试)",
    description: "内置 Mock 模型，仅用于开发与测试",
    category: "custom",
    protocol: "mock",
    requiresKey: false,
    envKeys: [],
    fallbackModels: [
      { id: "mock-model", label: "Mock Model", speed: "fast", contextWindow: 128_000 },
    ],
    devOnly: true,
  },
];

/**
 * 按激活模型推断上下文窗口（tokens）——pi / maka / Kun 的「模型自带窗口」模式。
 * 优先级：
 * 1. 连接显式 maxContextTokens（用户可覆盖，>0 时最优先）
 * 2. catalog 中模型 id 精确匹配（fallbackModels 或动态模型命中的 contextWindow）
 * 3. 同 provider 任一 catalog 模型窗口的 max（provider 级默认，覆盖动态 fetch 的未知模型）
 * 4. 全局兜底 DEFAULT_TOKEN_BUDGET（32k）
 */
export function resolveModelContextWindow(
  modelId?: string,
  connection?: { maxContextTokens?: number; providerType?: string },
  fallback: number = DEFAULT_TOKEN_BUDGET
): number {
  if (connection?.maxContextTokens && connection.maxContextTokens > 0) {
    return connection.maxContextTokens;
  }
  if (modelId) {
    const id = modelId.trim();
    for (const p of PROVIDER_CATALOG) {
      for (const m of p.fallbackModels) {
        if (m.id === id || id.endsWith(`/${m.id}`)) {
          return m.contextWindow ?? fallback;
        }
      }
    }
    if (connection?.providerType) {
      const p = PROVIDER_CATALOG.find((x) => x.id === connection.providerType);
      const windows = (p?.fallbackModels ?? [])
        .map((m) => m.contextWindow)
        .filter((w): w is number => typeof w === "number" && w > 0);
      if (windows.length > 0) return Math.max(...windows);
    }
  }
  return fallback;
}

/**
 * P2.9: 解析 ContextBuilder 组装 system prompt 的 token 预算。
 * 用户配置（config.context.maxTokens）控制组装体积，但需保证下限：
 * - 下限 = min(24k, 模型窗口×30%) — 静态区（身份/工具清单/行为指引）必须装得下，
 *   否则记忆/历史被截断、模型行为降级（16k 预算实测静态区就近占满）。
 * - 上限 = 模型窗口×50% — 防止预算超过窗口一半挤占对话历史。
 * 结果收敛到 [floor, cap]；用户预算在区间内时原样尊重。
 */
export function resolveContextPromptBudget(userBudget: number, modelWindow: number): number {
  if (modelWindow <= 0) return userBudget > 0 ? userBudget : DEFAULT_TOKEN_BUDGET;
  const floor = Math.min(24_000, Math.floor(modelWindow * 0.3));
  const cap = Math.max(floor, Math.floor(modelWindow * 0.5));
  const budget = userBudget > 0 ? userBudget : DEFAULT_TOKEN_BUDGET;
  return Math.max(floor, Math.min(budget, cap));
}

export function getCatalogProvider(id: string): CatalogProvider | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  domestic: "国内服务商",
  overseas: "海外服务商",
  local: "本地模型",
  custom: "自定义",
};
