// packages/config/src/vision.ts
/**
 * Vision capability helpers for the "model eyes" feature.
 *
 * A main model without multimodal support can delegate image understanding to
 * a separate vision-capable model (vision companion). These helpers decide
 * whether a model id is vision-capable using, in order:
 *   1. explicit per-connection override (LlmConnection.supportsVision)
 *   2. catalog capability metadata (fallbackModels[].capabilities)
 *   3. curated id keyword hints for common vision model families
 */
import { PROVIDER_CATALOG } from "./provider-catalog.js";

/** Substring hints for common vision-capable model families. */
export const VISION_MODEL_HINTS = [
  "vision",
  "-vl",
  "qwen-vl",
  "vl-max",
  "vl-plus",
  "glm-4v",
  "gpt-4o",
  "gpt-5",
  "gemini",
  "claude-3",
  "llava",
  "minicpm",
  "moondream",
  "internvl",
  "phi-3.5-vision",
] as const;

export interface VisionCapableConnection {
  /** Explicit user override: whether models in this connection support vision. */
  supportsVision?: boolean;
}

/**
 * Determine whether a model id supports vision input.
 * An explicit `supportsVision: true` on the connection wins; an explicit
 * `supportsVision: false` forces the negative. Otherwise the catalog and
 * keyword hints decide.
 */
export function isVisionModelId(modelId: string, conn?: VisionCapableConnection): boolean {
  const id = (modelId ?? "").toLowerCase().trim();
  if (!id) return false;

  if (conn?.supportsVision === true) return true;
  if (conn?.supportsVision === false) return false;

  for (const provider of PROVIDER_CATALOG) {
    const match = provider.fallbackModels.find((m) => m.id.toLowerCase() === id);
    if (match) return (match.capabilities ?? []).includes("vision");
  }

  return VISION_MODEL_HINTS.some((hint) => id.includes(hint));
}

/**
 * Pick the first vision-capable model from a connection's enabled models
 * (falls back to the full model list, then the default model).
 */
export function pickVisionModel(
  conn: VisionCapableConnection & {
    enabledModels?: string[];
    models?: string[];
    defaultModelId?: string;
  }
): string | undefined {
  if (!conn) return undefined;
  const candidates = [...(conn.enabledModels ?? []), ...(conn.models ?? [])];
  const unique = [...new Set(candidates)];
  for (const m of unique) {
    if (isVisionModelId(m, conn)) return m;
  }
  if (conn.defaultModelId && isVisionModelId(conn.defaultModelId, conn)) {
    return conn.defaultModelId;
  }
  return undefined;
}
