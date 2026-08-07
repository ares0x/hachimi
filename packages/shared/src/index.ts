/**
 * Shared utilities, constants, and helpers used across Hachimi packages.
 */

export function generateId(prefix = ""): string {
  return `${prefix}${crypto.randomUUID()}`;
}

export function now(): number {
  return Date.now();
}

export const CHANNELS = ["cli", "desktop", "api", "telegram", "wechat", "slack", "system"] as const;

export * from "./constants/index.js";
export * from "./errors.js";
export * from "./i18n/index.js";
export { safeParseToolArgs } from "./json-safe.js";
export type { LogLevel } from "./logger.js";
export { createScopedLogger, log, setLogFormat, setLogLevel, setLogSilent } from "./logger.js";
export * from "./semantic-search.js";
export {
  calculateCostUSD,
  createTokenEstimator,
  defaultTokenEstimator,
  estimateTokenCostUSD,
  getModelContextLimit,
  MODEL_CONTEXT_LIMITS,
  MODEL_PRICING_CATALOG,
  type ModelPricing,
  type NormalizedUsage,
  normalizeUsage,
  sumUsage,
} from "./token.js";
export { summarizeToolArgs, type ToolArgSummary } from "./tool-summary.js";
export { cosineSimilarity, jaccardSimilarity, normalizeText } from "./vector.js";
