// packages/core/src/vision/companion.ts
/**
 * VisionCompanion — "model eyes" service.
 *
 * A main model without multimodal input (e.g. DeepSeek V4 Flash) can delegate
 * image understanding to a separate vision-capable model. This class resolves
 * the companion connection/model from config and turns images into detailed
 * text descriptions that the main model can consume.
 *
 * The companion is provider-agnostic: it sends the same OpenAI-style
 * `image_url` content parts to whatever transport the companion connection
 * uses (Anthropic transport converts them to base64 image blocks).
 */
import { createHash } from "node:crypto";
import type { HachimiConfig } from "@hachimi/config";
import { getDefaultCredentialStore, isVisionModelId, pickVisionModel } from "@hachimi/config";
import { generateId, type NormalizedUsage } from "@hachimi/shared";
import { createLLMForConnection } from "../agent/llm-factory.js";
import type { LLMProvider, Message } from "../types/index.js";

export interface VisionImageInput {
  /** Data URL (data:image/...;base64,...) or remote http(s) URL. */
  dataUrl: string;
}

export interface VisionDescribeResult {
  description: string;
  /** True when served from the in-memory cache (no extra API call). */
  cached: boolean;
  /** Normalized usage of the underlying vision-model call. */
  usage?: NormalizedUsage & { costUsd?: number };
}

export interface VisionCompanionOptions {
  config: HachimiConfig;
  /** Injectable provider factory (tests / alternate credential paths). */
  getProvider?: (connectionId: string, modelId: string) => LLMProvider | null;
}

/** Default description prompt sent to the vision companion. */
export const DEFAULT_DESCRIPTION_PROMPT =
  "你是 Hachimi 的视觉协助模型，负责为不具备多模态能力的主模型描述图片内容。\n" +
  "请详细描述这张图片，包括：\n" +
  "- 画面主体与整体布局\n" +
  "- 所有可见文字（OCR，逐字给出）\n" +
  "- 关键元素的位置（用相对坐标或区域描述，供后续点击/定位参考）\n" +
  "- 异常、报错信息或需要特别留意的细节\n" +
  "保持客观、具体、结构化。";

export class VisionCompanion {
  private readonly config: HachimiConfig;
  private readonly getProvider: (connectionId: string, modelId: string) => LLMProvider | null;
  /** image-hash → description (process-lifetime cache, keyed per companion model). */
  private readonly cache = new Map<string, string>();

  constructor(options: VisionCompanionOptions) {
    this.config = options.config;
    this.getProvider =
      options.getProvider ??
      ((connectionId, modelId) => createLLMForConnection(this.config, connectionId, modelId));
  }

  /** Whether a usable companion (connection + model) can be resolved. */
  isConfigured(): boolean {
    return this.resolve() !== null;
  }

  /** The companion connection/model the config resolves to (or null). */
  resolve(): { connectionId: string; modelId: string } | null {
    const vision = this.config.llm.vision;
    const cfg = this.config.llm;
    const connections = cfg.connections || {};

    let connectionId = vision?.connectionId;
    let modelId = vision?.modelId;

    if (connectionId && !connections[connectionId]) {
      connectionId = undefined;
    }

    if (!connectionId) {
      // Auto-detect the first enabled, key-usable connection with a vision model.
      // Keys may live in the credential store (desktop) rather than config.
      const credStore = getDefaultCredentialStore();
      for (const conn of Object.values(connections)) {
        if (!conn.enabled) continue;
        const usable =
          conn.providerType === "mock" ||
          conn.providerType === "ollama" ||
          Boolean(conn.apiKey) ||
          credStore.has(conn.id);
        if (!usable) continue;
        if (pickVisionModel(conn)) {
          connectionId = conn.id;
          break;
        }
      }
    }

    if (!connectionId) return null;
    const conn = connections[connectionId];
    if (!conn) return null;

    if (!modelId) {
      modelId =
        pickVisionModel(conn) ??
        (conn.defaultModelId && isVisionModelId(conn.defaultModelId, conn)
          ? conn.defaultModelId
          : undefined);
    }
    if (!modelId) return null;
    if (!isVisionModelId(modelId, conn)) return null;

    return { connectionId, modelId };
  }

  /**
   * Describe a single image using the companion model.
   * Returns null when the companion is not configured or the call fails —
   * callers degrade gracefully (no silent drop).
   */
  async describeImage(
    image: VisionImageInput,
    opts: { signal?: AbortSignal; descriptionPrompt?: string } = {}
  ): Promise<VisionDescribeResult | null> {
    const resolved = this.resolve();
    if (!resolved) return null;

    const dataUrl = image.dataUrl;
    const key = `${resolved.modelId}:${this.hashUrl(dataUrl)}`;
    const cachedDesc = this.cache.get(key);
    if (cachedDesc) {
      return { description: cachedDesc, cached: true };
    }

    const provider = this.getProvider(resolved.connectionId, resolved.modelId);
    if (!provider) return null;

    const prompt =
      opts.descriptionPrompt ??
      this.config.llm.vision?.descriptionPrompt ??
      DEFAULT_DESCRIPTION_PROMPT;

    const messages: Message[] = [
      {
        id: generateId("msg_"),
        role: "system",
        content: prompt,
        timestamp: Date.now(),
      },
      {
        id: generateId("msg_"),
        role: "user",
        content: [
          { type: "text", text: "请描述这张图片：" },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
        timestamp: Date.now(),
      },
    ];

    const response = await provider.chat(messages, [], {
      model: resolved.modelId,
      signal: opts.signal,
    });

    const description = (response.content ?? "").trim();
    if (!description) return null;

    this.cache.set(key, description);
    return { description, cached: false, usage: response.usage };
  }

  private hashUrl(dataUrl: string): string {
    return createHash("sha256").update(dataUrl).digest("hex").slice(0, 24);
  }
}
