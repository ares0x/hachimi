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

/**
 * H3.6: 估算对话 Token 的美金开销 ($)
 */
export function estimateTokenCostUSD(
  inputTokens: number,
  outputTokens: number,
  provider = "deepseek",
): number {
  // 默认美金价格费率 (per 1M tokens)
  let inputRatePerM = 0.14; // DeepSeek-V3 cache miss default
  let outputRatePerM = 0.28;

  if (provider.includes("openai") || provider.includes("gpt-4o")) {
    inputRatePerM = 2.5;
    outputRatePerM = 10.0;
  } else if (provider.includes("claude") || provider.includes("anthropic")) {
    inputRatePerM = 3.0;
    outputRatePerM = 15.0;
  }

  const cost = (inputTokens / 1_000_000) * inputRatePerM + (outputTokens / 1_000_000) * outputRatePerM;
  return Number(cost.toFixed(6));
}
