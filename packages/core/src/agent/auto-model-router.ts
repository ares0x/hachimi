// packages/core/src/agent/auto-model-router.ts
import { isVisionModelId } from "@hachimi/config";
/**
 * P2-B6: Automatic model routing (light/heavy + reasoning effort).
 *
 * Model-agnostic: "fast" and "pro" are just two tiers whose concrete model ids
 * come from config / the active connection's enabled models. When routing is
 * disabled or the heuristic is uncertain, the active selection is kept.
 */

export type ModelTier = "fast" | "pro";

export type ReasoningEffort = "low" | "medium" | "high";

export interface AutoModelRoutingConfig {
  enabled?: boolean;
  /** Explicit fast-tier model id (takes priority over keyword matching) */
  fastModelId?: string;
  /** Explicit pro-tier model id (takes priority over keyword matching) */
  proModelId?: string;
  /** Substring keywords used to pick the fast tier from enabled models */
  fastModelKeywords?: string[];
  /** Substring keywords used to pick the pro tier from enabled models */
  proModelKeywords?: string[];
  /** Prompts longer than this many chars are routed to the pro tier */
  longPromptThreshold?: number;
  /** Reasoning effort attached to pro-tier calls (OpenAI-compatible models) */
  proReasoningEffort?: ReasoningEffort;
}

export interface AutoModelRouteInput {
  prompt: string;
  /** Tools already invoked during the current run (loop rounds > 1) */
  recentTools?: string[];
  /** Number of history messages already in context */
  historyLength?: number;
  /** Plan mode biases toward the pro tier (planning needs depth) */
  planMode?: boolean;
  /** Enabled models of the active connection (routing candidates) */
  availableModels?: string[];
  /** Active selection's model id — the no-op fallback */
  defaultModelId?: string;
  config?: AutoModelRoutingConfig;
  /**
   * 上下文包含图片：优先路由到同一连接内的 vision 模型
   * （仅当 visionRouting 未关闭；配了视觉协助时由 companion 描述，无需切换）。
   */
  hasImages?: boolean;
  /** 是否允许为图片路由到视觉模型（默认 true） */
  visionRouting?: boolean;
}

export interface AutoModelRoute {
  modelId: string;
  tier: ModelTier;
  reasoningEffort?: ReasoningEffort;
}

const DEFAULT_FAST_KEYWORDS = ["flash", "mini", "lite", "haiku", "turbo", "fast"];
const DEFAULT_PRO_KEYWORDS = ["pro", "sonnet", "opus", "reasoner", "think", "max"];

const COMPLEX_KEYWORDS = [
  "debug",
  "fix",
  "bug",
  "error",
  "refactor",
  "implement",
  "test",
  "migrate",
  "architect",
  "performance",
  "review",
  "analyze",
  "排查",
  "调试",
  "修复",
  "报错",
  "崩溃",
  "重构",
  "实现",
  "测试",
  "分析",
  "检查",
  "优化",
  "性能",
  "架构",
  "迁移",
  "代码",
];

const SIMPLE_KEYWORDS = [
  "hello",
  "hi",
  "hey",
  "thanks",
  "thank you",
  "status",
  "time",
  "weather",
  "remember",
  "你好",
  "您好",
  "谢谢",
  "状态",
  "时间",
  "天气",
  "记住",
  "总结会话",
];

const HEAVY_TOOLS = new Set([
  "run_command",
  "write_file",
  "replace_file_content",
  "patch_file",
  "delegate_subagent",
  "update_work_plan",
  "browser_navigate",
  "browser_click",
  "capture_terminal",
]);

/** Rough code-ish shape detection: fences, path prefixes, source extensions */
const CODE_SHAPE =
  /```|(\/Users\/|src\/|packages\/|lib\/|app\/|test\/|\.\/|\.\.\/)|\b[\w-]+\.(ts|tsx|js|jsx|py|rs|go|java|json|md|css|html|sh|yml|yaml|toml|lock)\b/i;

export type RequestComplexity = "simple" | "complex" | "ambiguous";

/**
 * Classify a request by cheap deterministic signals only — no extra LLM call.
 * Used to decide fast vs pro tier before each turn.
 */
export function classifyRequestComplexity(
  prompt: string,
  ctx: {
    recentTools?: string[];
    historyLength?: number;
    planMode?: boolean;
    longPromptThreshold?: number;
  } = {}
): RequestComplexity {
  const text = prompt.trim();
  if (!text) return "ambiguous";

  let score = 0;
  const threshold = ctx.longPromptThreshold ?? 400;

  if (text.length > threshold) score += 2;
  if (CODE_SHAPE.test(text)) score += 2;
  if (ctx.planMode) score += 1;
  if ((ctx.historyLength ?? 0) > 40) score += 1;
  if (ctx.recentTools?.some((t) => HEAVY_TOOLS.has(t))) score += 1;

  const lower = text.toLowerCase();
  for (const kw of COMPLEX_KEYWORDS) {
    if (lower.includes(kw)) score += 1;
  }
  for (const kw of SIMPLE_KEYWORDS) {
    if (lower.includes(kw)) score -= 1;
  }
  // Short small-talk / status requests are cheap and should stay on fast tier
  if (text.length <= 20 && SIMPLE_KEYWORDS.some((k) => lower.includes(k))) score -= 1;

  if (score >= 2) return "complex";
  if (score <= -1) return "simple";
  return "ambiguous";
}

function inferTier(modelId: string | undefined, config: AutoModelRoutingConfig): ModelTier {
  const id = (modelId ?? "").toLowerCase();
  if (!id || id === "default") return "fast";
  const proKw = config.proModelKeywords?.length ? config.proModelKeywords : DEFAULT_PRO_KEYWORDS;
  if (proKw.some((k) => id.includes(k))) return "pro";
  const fastKw = config.fastModelKeywords?.length
    ? config.fastModelKeywords
    : DEFAULT_FAST_KEYWORDS;
  if (fastKw.some((k) => id.includes(k))) return "fast";
  return "fast";
}

function pickModelForTier(
  tier: ModelTier,
  availableModels: string[] | undefined,
  defaultModelId: string,
  config: AutoModelRoutingConfig
): string | undefined {
  if (tier === "fast" && config.fastModelId) return config.fastModelId;
  if (tier === "pro" && config.proModelId) return config.proModelId;

  const keywords =
    tier === "fast"
      ? config.fastModelKeywords?.length
        ? config.fastModelKeywords
        : DEFAULT_FAST_KEYWORDS
      : config.proModelKeywords?.length
        ? config.proModelKeywords
        : DEFAULT_PRO_KEYWORDS;

  const candidates = availableModels?.length ? availableModels : [defaultModelId];
  return candidates.find((c) => keywords.some((k) => c.toLowerCase().includes(k)));
}

/**
 * Resolve the model for the next LLM call.
 * - hasImages + visionRouting → vision-capable model when available
 * - complex request  → pro tier (or default when no pro model is available)
 * - simple request  → fast tier (or default when no fast model is available)
 * - ambiguous       → keep the active selection (no-op routing)
 */
export function resolveAutoModelRoute(input: AutoModelRouteInput): AutoModelRoute {
  const config = input.config ?? {};
  const defaultModelId = input.defaultModelId ?? "default";

  // "模型的眼睛"：图片上下文优先路由到同连接的视觉模型
  if (input.hasImages && input.visionRouting !== false && input.availableModels?.length) {
    const visionModel = input.availableModels.find((m) => isVisionModelId(m));
    if (visionModel) {
      return {
        modelId: visionModel,
        tier: inferTier(visionModel, config),
        reasoningEffort: config.proReasoningEffort ?? "medium",
      };
    }
  }

  const decision = classifyRequestComplexity(input.prompt, {
    recentTools: input.recentTools,
    historyLength: input.historyLength,
    planMode: input.planMode,
    longPromptThreshold: config.longPromptThreshold,
  });

  if (decision === "ambiguous") {
    return {
      modelId: defaultModelId,
      tier: inferTier(defaultModelId, config),
    };
  }

  const tier: ModelTier = decision === "simple" ? "fast" : "pro";
  const modelId = pickModelForTier(tier, input.availableModels, defaultModelId, config);
  if (!modelId) {
    return { modelId: defaultModelId, tier: inferTier(defaultModelId, config) };
  }

  return {
    modelId,
    tier,
    reasoningEffort: tier === "pro" ? (config.proReasoningEffort ?? "high") : undefined,
  };
}
