/**
 * 简单 Token 估算器（支持 OpenAI / DeepSeek 兼容模型）
 * 后续可替换为 tiktoken wasm 版本以获得更高精度
 */
export function createTokenEstimator(model: string = "gpt-4o-mini") {
  // 粗略估算：中文 ~1.5-2 tokens/字，英文 ~1 token/4 chars
  return (text: string): number => {
    if (!text) return 0;

    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const nonChinese = text.length - chineseChars;

    // 保守估算
    let tokens = Math.ceil(chineseChars * 1.8) + Math.ceil(nonChinese / 4);

    // 特殊模型调整
    if (model.includes("deepseek") || model.includes("qwen")) {
      tokens = Math.ceil(tokens * 1.1); // 部分模型编码略不同
    }

    return Math.max(1, tokens);
  };
}

// 全局默认实例
export const defaultTokenEstimator = createTokenEstimator();

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

/**
 * 汇总多条用量记录（同一 run 内多次 LLM 调用或按会话聚合时使用）。
 * 保留 costUsd（未提供则视为 0），返回四舍五入到 6 位小数的总费用。
 */
export function sumUsage(
  usages: Array<NormalizedUsage & { costUsd?: number }>
): NormalizedUsage & { costUsd: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  for (const u of usages) {
    inputTokens += u.inputTokens ?? 0;
    outputTokens += u.outputTokens ?? 0;
    cacheReadTokens += u.cacheReadTokens ?? 0;
    cacheWriteTokens += u.cacheWriteTokens ?? 0;
    totalTokens += u.totalTokens ?? 0;
    costUsd += u.costUsd ?? 0;
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    costUsd: Number(costUsd.toFixed(6)),
  };
}

export interface ModelPricing {
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  cacheReadUsdPer1M?: number;
  cacheWriteUsdPer1M?: number;
}

export const MODEL_PRICING_CATALOG: Record<string, ModelPricing> = {
  deepseek: {
    inputUsdPer1M: 0.14,
    outputUsdPer1M: 0.28,
    cacheReadUsdPer1M: 0.014,
  },
  openai: {
    inputUsdPer1M: 2.5,
    outputUsdPer1M: 10.0,
    cacheReadUsdPer1M: 1.25,
  },
  "openai-mini": {
    inputUsdPer1M: 0.15,
    outputUsdPer1M: 0.6,
    cacheReadUsdPer1M: 0.075,
  },
  anthropic: {
    inputUsdPer1M: 3.0,
    outputUsdPer1M: 15.0,
    cacheReadUsdPer1M: 0.3,
    cacheWriteUsdPer1M: 3.75,
  },
  gemini: {
    inputUsdPer1M: 0.075,
    outputUsdPer1M: 0.3,
    cacheReadUsdPer1M: 0.01875,
  },
  ollama: {
    inputUsdPer1M: 0,
    outputUsdPer1M: 0,
    cacheReadUsdPer1M: 0,
    cacheWriteUsdPer1M: 0,
  },
  local: {
    inputUsdPer1M: 0,
    outputUsdPer1M: 0,
    cacheReadUsdPer1M: 0,
    cacheWriteUsdPer1M: 0,
  },
};

/**
 * 归一化不同 LLM Provider 原始返回的 Usage 结构
 */
export function normalizeUsage(raw: any): NormalizedUsage {
  if (!raw || typeof raw !== "object") {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
    };
  }

  const inputTokens = Number(
    raw.inputTokens ??
      raw.input_tokens ??
      raw.promptTokens ??
      raw.prompt_tokens ??
      raw.promptTokenCount ??
      0
  );
  const outputTokens = Number(
    raw.outputTokens ??
      raw.output_tokens ??
      raw.completionTokens ??
      raw.completion_tokens ??
      raw.candidatesTokenCount ??
      0
  );

  const cacheReadTokens = Number(
    raw.cacheReadTokens ??
      raw.cacheReadInputTokens ??
      raw.cachedInputTokens ??
      raw.prompt_cache_hit_tokens ??
      raw.prompt_tokens_details?.cached_tokens ??
      raw.cache_read_input_tokens ??
      0
  );

  const cacheWriteTokens = Number(
    raw.cacheWriteTokens ??
      raw.cacheWriteInputTokens ??
      raw.cacheCreationInputTokens ??
      raw.cache_creation_input_tokens ??
      0
  );

  const totalTokens = Number(
    raw.totalTokens ?? raw.total_tokens ?? raw.totalTokenCount ?? inputTokens + outputTokens
  );

  // P1.2: 缓存读取信任因子 — 部分 provider（MiniMax 类实现）会虚报 cache_read 超过
  // 实际输入量，导致缓存命中率与成本虚高（"永远 100% 命中"）。缓存读取量不可能超过
  // 非输出 token 总量（输入 + 缓存写入），超出即按边界截断。Anthropic 的 input_tokens
  // 不含缓存读取，但 total_tokens 包含，因此该上限不误伤合法数据。
  const saneCacheReadCeiling = Math.max(totalTokens - outputTokens, 0);
  const normalizedCacheRead = Number.isFinite(saneCacheReadCeiling)
    ? Math.min(Math.max(0, cacheReadTokens), saneCacheReadCeiling)
    : Math.max(0, cacheReadTokens);

  return {
    inputTokens: Math.max(0, inputTokens),
    outputTokens: Math.max(0, outputTokens),
    cacheReadTokens: normalizedCacheRead,
    cacheWriteTokens: Math.max(0, cacheWriteTokens),
    totalTokens: Math.max(0, totalTokens),
  };
}

/**
 * 模型无关的美金开销计算函数
 */
export function calculateCostUSD(
  usage: NormalizedUsage,
  modelOrProvider = "deepseek",
  customPricing?: Record<string, ModelPricing>
): number {
  const catalog = { ...MODEL_PRICING_CATALOG, ...customPricing };
  const key =
    Object.keys(catalog).find((k) => modelOrProvider.toLowerCase().includes(k)) || "deepseek";
  const pricing = catalog[key] || catalog.deepseek;

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputUsdPer1M;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputUsdPer1M;
  const cacheReadCost =
    (usage.cacheReadTokens / 1_000_000) * (pricing.cacheReadUsdPer1M ?? pricing.inputUsdPer1M);
  const cacheWriteCost =
    (usage.cacheWriteTokens / 1_000_000) * (pricing.cacheWriteUsdPer1M ?? pricing.inputUsdPer1M);

  const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;
  return Number(totalCost.toFixed(6));
}

/**
 * 估算对话 Token 的美金开销 ($)
 */
export function estimateTokenCostUSD(
  inputTokens: number,
  outputTokens: number,
  provider = "deepseek"
): number {
  return calculateCostUSD(
    {
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: inputTokens + outputTokens,
    },
    provider
  );
}

/**
 * 常见 LLM 模型的官方 Context Window 规格目录 (Tokens) (Maka / Craft Agents 模式)
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Anthropic Claude
  "claude-3-7": 200_000,
  "claude-3-5": 200_000,
  "claude-3": 200_000,

  // DeepSeek
  deepseek: 128_000,

  // OpenAI
  "gpt-4o": 128_000,
  "o3-mini": 200_000,
  o1: 200_000,
  "gpt-4": 128_000,

  // Google Gemini
  gemini: 1_000_000,

  // Qwen & Moonshot / Kimi
  qwen: 128_000,
  moonshot: 128_000,
  kimi: 128_000,

  // Ollama & Local
  ollama: 32_768,
  local: 32_768,
};

/**
 * 根据模型 ID 或服务商名称动态解析该模型的官方最大 Context Window
 * 默认保留 20% 安全 Buffer（即实际 Prompt 软上限 = window * 0.8）
 */
export function getModelContextLimit(
  modelIdOrProvider?: string,
  bufferRatio = 0.8,
  explicitTokens?: number
): number {
  if (explicitTokens && explicitTokens > 0) {
    return Math.floor(explicitTokens * bufferRatio);
  }
  if (!modelIdOrProvider) return Math.floor(64_000 * bufferRatio);
  const target = modelIdOrProvider.toLowerCase();

  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (target.includes(key)) {
      return Math.floor(limit * bufferRatio);
    }
  }

  // 未知模型默认按 64k 算
  return Math.floor(64_000 * bufferRatio);
}
