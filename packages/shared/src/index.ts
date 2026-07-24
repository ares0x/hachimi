/**
 * Shared utilities, constants, and helpers used across Hachimi packages.
 */

export function generateId(prefix = ""): string {
  return `${prefix}${crypto.randomUUID()}`;
}

export function now(): number {
  return Date.now();
}

export const CHANNELS = [
  "cli",
  "desktop",
  "api",
  "telegram",
  "wechat",
  "slack",
  "system",
] as const;

export { log, setLogSilent } from "./logger.js";
export type { LogLevel } from "./logger.js";
export { createTokenEstimator, defaultTokenEstimator } from "./token.js";
export { cosineSimilarity, normalizeText, jaccardSimilarity } from "./vector.js";
