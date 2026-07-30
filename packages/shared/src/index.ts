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
export type { LogLevel } from "./logger.js";
export { createScopedLogger, log, setLogFormat, setLogLevel, setLogSilent } from "./logger.js";
export { createTokenEstimator, defaultTokenEstimator, estimateTokenCostUSD } from "./token.js";
export { summarizeToolArgs, type ToolArgSummary } from "./tool-summary.js";
export { cosineSimilarity, jaccardSimilarity, normalizeText } from "./vector.js";
