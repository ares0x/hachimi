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

  return {
    inputTokens: Math.max(0, inputTokens),
    outputTokens: Math.max(0, outputTokens),
    cacheReadTokens: Math.max(0, cacheReadTokens),
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
