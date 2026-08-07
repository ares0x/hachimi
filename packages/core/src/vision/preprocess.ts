// packages/core/src/vision/preprocess.ts
/**
 * Pre-LLM-call visual content preprocessing.
 *
 * Scans the outgoing message array for `image_url` content parts and decides
 * what the active model receives:
 *   - active model is vision-capable      → pass images through untouched
 *   - vision companion is configured      → describe images, replace with text
 *   - neither                            → degrade to an explicit notice
 *
 * Runs per round inside the agent loop so tool-generated screenshots are
 * handled on the rounds they appear.
 */

import { isVisionModelId } from "@hachimi/config";
import type { NormalizedUsage } from "@hachimi/shared";
import type { ContentPart, Message } from "../types/index.js";
import type { VisionCompanion } from "./companion.js";

export interface VisionPreprocessOptions {
  /** Model that will receive the messages (post auto-routing). */
  modelId: string;
  /** Explicit connection-level vision capability (user override). */
  modelHasVision?: boolean;
  companion?: VisionCompanion | null;
  signal?: AbortSignal;
  /** Called once per batch when the companion produced descriptions. */
  onCompanionCall?: (info: {
    model: string;
    imageCount: number;
    cacheHits: number;
    usage?: NormalizedUsage & { costUsd?: number };
  }) => void;
  /** Called when images were dropped because no vision path exists. */
  onDegraded?: (imageCount: number) => void;
}

interface ImageTarget {
  message: Message;
  index: number;
  url: string;
}

/** Replace one content part (images were collected only from array content). */
function replacePart(target: ImageTarget, part: ContentPart): void {
  const content = target.message.content;
  if (Array.isArray(content)) {
    content[target.index] = part;
  }
}

const DEGRADED_NOTICE =
  "[Image omitted — the active model has no vision capability and no vision " +
  "companion is configured. Enable one in Settings → Model Connections.]";

/** Collect all image parts that would reach the model. */
function collectImageTargets(messages: Message[]): ImageTarget[] {
  const targets: ImageTarget[] = [];
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    message.content.forEach((part, index) => {
      if (part.type === "image_url") {
        targets.push({ message, index, url: part.image_url.url });
      }
    });
  }
  return targets;
}

export async function preprocessVisualContent(
  messages: Message[],
  opts: VisionPreprocessOptions
): Promise<void> {
  const targets = collectImageTargets(messages);
  if (targets.length === 0) return;

  const hasVision = opts.modelHasVision ?? isVisionModelId(opts.modelId);
  if (hasVision) return;

  const companion = opts.companion;
  if (companion && companion.isConfigured()) {
    let cacheHits = 0;
    let totalUsage: (NormalizedUsage & { costUsd?: number }) | undefined;

    for (const target of targets) {
      // Reuse the description persisted on the message (same round re-runs,
      // session carry-over) before paying for another vision call.
      const existing = target.message.metadata?.visionDescription;
      let description: string | null = typeof existing === "string" ? existing : null;
      let cached = existing !== undefined;

      if (!description) {
        const result = await companion.describeImage(
          { dataUrl: target.url },
          { signal: opts.signal }
        );
        if (!result) {
          replacePart(target, { type: "text", text: DEGRADED_NOTICE });
          continue;
        }
        description = result.description;
        cached = result.cached;
        if (result.usage) {
          totalUsage = totalUsage ? mergeUsage(totalUsage, result.usage) : result.usage;
        }
      }

      if (cached) cacheHits += 1;

      replacePart(target, {
        type: "text",
        text: `[Image description (${companion.resolve()?.modelId ?? "vision"}): ${description}]`,
      });
      target.message.metadata = {
        ...(target.message.metadata ?? {}),
        visionDescription: description,
      };
    }

    opts.onCompanionCall?.({
      model: companion.resolve()?.modelId ?? "vision",
      imageCount: targets.length,
      cacheHits,
      usage: totalUsage,
    });
    return;
  }

  // No vision path — degrade explicitly instead of silently dropping images.
  for (const target of targets) {
    replacePart(target, { type: "text", text: DEGRADED_NOTICE });
  }
  opts.onDegraded?.(targets.length);
}

function mergeUsage(
  a: NormalizedUsage & { costUsd?: number },
  b: NormalizedUsage & { costUsd?: number }
): NormalizedUsage & { costUsd?: number } {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
    cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
    costUsd: (a.costUsd ?? 0) + (b.costUsd ?? 0),
  };
}
