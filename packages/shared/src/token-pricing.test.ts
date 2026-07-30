// packages/shared/src/token-pricing.test.ts
import { describe, expect, it } from "vitest";
import { calculateCostUSD, normalizeUsage } from "./token.js";

describe("Model-Agnostic Token Usage & Pricing Suite", () => {
  it("normalizes OpenAI raw usage format correctly", () => {
    const rawOpenAI = {
      prompt_tokens: 1000,
      completion_tokens: 200,
      prompt_tokens_details: { cached_tokens: 300 },
      total_tokens: 1200,
    };
    const usage = normalizeUsage(rawOpenAI);
    expect(usage.inputTokens).toBe(1000);
    expect(usage.outputTokens).toBe(200);
    expect(usage.cacheReadTokens).toBe(300);
    expect(usage.totalTokens).toBe(1200);
  });

  it("normalizes Anthropic raw usage format correctly", () => {
    const rawAnthropic = {
      input_tokens: 5000,
      output_tokens: 1500,
      cache_read_input_tokens: 2000,
      cache_creation_input_tokens: 1000,
    };
    const usage = normalizeUsage(rawAnthropic);
    expect(usage.inputTokens).toBe(5000);
    expect(usage.outputTokens).toBe(1500);
    expect(usage.cacheReadTokens).toBe(2000);
    expect(usage.cacheWriteTokens).toBe(1000);
  });

  it("normalizes DeepSeek raw usage format correctly", () => {
    const rawDeepSeek = {
      prompt_tokens: 10000,
      completion_tokens: 500,
      prompt_cache_hit_tokens: 8000,
    };
    const usage = normalizeUsage(rawDeepSeek);
    expect(usage.inputTokens).toBe(10000);
    expect(usage.outputTokens).toBe(500);
    expect(usage.cacheReadTokens).toBe(8000);
  });

  it("calculates cost USD model-agnostically with catalog pricing", () => {
    const usage = {
      inputTokens: 10000,
      outputTokens: 1000,
      cacheReadTokens: 5000,
      cacheWriteTokens: 0,
      totalTokens: 11000,
    };

    // DeepSeek: input 0.14/M, output 0.28/M, cacheRead 0.014/M
    // 10000 * 0.14/1M + 1000 * 0.28/1M + 5000 * 0.014/1M = 0.0014 + 0.00028 + 0.00007 = 0.00175
    const costDeepSeek = calculateCostUSD(usage, "deepseek");
    expect(costDeepSeek).toBeCloseTo(0.00175, 5);

    // Ollama / Local: 0 cost
    const costLocal = calculateCostUSD(usage, "ollama");
    expect(costLocal).toBe(0);
  });
});
