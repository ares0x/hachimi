// packages/config/src/provider-catalog.ts
// Preset provider catalog: the single source of truth for "which providers can I add".
// A catalog entry is a template; users instantiate it into an LlmConnection.

export type CatalogCategory = "domestic" | "overseas" | "local" | "custom";

export interface CatalogModel {
  id: string;
  label?: string;
  speed?: "fast" | "balanced" | "thorough";
  capabilities?: string[]; // e.g. ["vision", "reasoning", "tools"]
  recommended?: boolean;
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
      { id: "deepseek-chat", label: "DeepSeek Chat", speed: "balanced", recommended: true },
      {
        id: "deepseek-reasoner",
        label: "DeepSeek Reasoner",
        speed: "thorough",
        capabilities: ["reasoning"],
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
      { id: "kimi-latest", label: "Kimi Latest", speed: "balanced", recommended: true },
      { id: "moonshot-v1-8k", label: "Moonshot v1 8K", speed: "fast" },
      { id: "moonshot-v1-32k", label: "Moonshot v1 32K", speed: "balanced" },
      { id: "moonshot-v1-128k", label: "Moonshot v1 128K", speed: "thorough" },
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
      { id: "qwen-plus", label: "Qwen Plus", speed: "balanced", recommended: true },
      { id: "qwen-turbo", label: "Qwen Turbo", speed: "fast" },
      { id: "qwen-max", label: "Qwen Max", speed: "thorough" },
      { id: "qwen-long", label: "Qwen Long", speed: "balanced" },
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
      },
      { id: "gpt-4o-mini", label: "GPT-4o mini", speed: "fast" },
      {
        id: "gpt-4-turbo",
        label: "GPT-4 Turbo",
        speed: "thorough",
        capabilities: ["vision"],
      },
      { id: "o3-mini", label: "o3-mini", speed: "thorough", capabilities: ["reasoning"] },
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
      { id: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet", speed: "balanced", recommended: true },
      { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", speed: "balanced" },
      { id: "claude-3-5-haiku", label: "Claude 3.5 Haiku", speed: "fast" },
      { id: "claude-3-opus", label: "Claude 3 Opus", speed: "thorough" },
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
      { id: "qwen2.5-coder", label: "Qwen2.5 Coder", speed: "balanced", recommended: true },
      { id: "llama3.3", label: "Llama 3.3", speed: "balanced" },
      { id: "deepseek-r1:8b", label: "DeepSeek R1 8B", speed: "thorough" },
      { id: "mistral", label: "Mistral", speed: "fast" },
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
    id: "mock",
    label: "Mock (开发测试)",
    description: "内置 Mock 模型，仅用于开发与测试",
    category: "custom",
    protocol: "mock",
    requiresKey: false,
    envKeys: [],
    fallbackModels: [{ id: "mock-model", label: "Mock Model", speed: "fast" }],
    devOnly: true,
  },
];

export function getCatalogProvider(id: string): CatalogProvider | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  domestic: "国内服务商",
  overseas: "海外服务商",
  local: "本地模型",
  custom: "自定义",
};
