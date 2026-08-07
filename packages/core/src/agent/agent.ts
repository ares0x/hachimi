// packages/core/src/agent/agent.ts
import {
  DEFAULT_MAX_TOOL_ROUNDS,
  DEFAULT_TOKEN_BUDGET,
  defaultTokenEstimator,
  formatUserRejectionMessage,
  generateId,
  i18n,
  type NormalizedUsage,
} from "@hachimi/shared";
import { ContextBuilder } from "../context/builder.js";
import type { PersonalContextLoader } from "../context/personal-context.js";
import type { HookRegistry } from "../extensions/hooks.js";
import type { MemoryManager } from "../memory/manager.js";
import type { FileHistoryStore } from "../rewind/file-history.js";
import type { SkillRegistry } from "../skills/registry.js";
import { archiveToolResult } from "../tools/artifact-archive.js";
import type { SessionTrustLevel, SurfaceType } from "../tools/policy.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolApprovalHandler } from "../tools/types.js";
import type {
  ChannelType,
  ContentPart,
  LLMProvider,
  LLMResponse,
  Message,
  RuntimeAttachment,
  ToolCall,
  ToolDefinition,
  ToolPermission,
} from "../types/index.js";
import {
  attachmentToImagePart,
  consumeToolImageMarkers,
  hasImageContent,
  preprocessVisualContent,
  type VisionCompanion,
} from "../vision/index.js";
import type { WorkManager } from "../work/work-manager.js";
import { type AutoModelRoutingConfig, resolveAutoModelRoute } from "./auto-model-router.js";
import { withStreamWatchdog } from "./stream-watchdog.js";

/**
 * P2.8/P1: 硬性上下文预算闸门 — 消息序列（真实 usage 校准后的估算）达到
 * `contextMaxTokens - reserve` 时强制停止工具调用，以空工具面生成最终结论。
 * 采用「窗口 − 保留余量」触发（pi / Claude Code 的 window-minus-buffer 模式），
 * 保留余量用于容纳最终结论与工具响应，避免超窗后被 provider 拒绝。
 * 低于该值只注入建议性提醒（见 PostTurnHook）。
 */
const HARD_CONTEXT_RESERVE_TOKENS = 4096;
const HARD_CONTEXT_RESERVE_RATIO = 0.15;
const HARD_CONTEXT_RESERVE_MIN_TOKENS = 64;

/** P2: 轮内工具结果裁剪 — 早期大结果总量上限（与 ContextBuilder 历史预算对齐） */
const ACTIVE_TOOL_RESULT_TOTAL_BYTES = 60000;
/** P2: 轮内工具结果裁剪 — 保留尾部条数（最新几轮不裁剪） */
const ACTIVE_TOOL_RESULT_PRESERVE_TAIL = 10;
/** P2.9: 软阈值自动压缩（Claude Code auto-compact / Kun 75% 模式）— 触发占比 */
const SOFT_COMPACT_RATIO = 0.75;
/** P2.9: 同一 run 内自动压缩次数上限（防循环压缩导致抖动） */
const MAX_AUTO_COMPACT_PER_RUN = 2;

/** P2.9: 会话级语义总结的 system prompt（Claude Code Summary API 模式） */
const SESSION_SUMMARY_PROMPT =
  "请用中文将以下对话历史压缩为一段结构化摘要（150-250 字），涵盖：\n" +
  "1) 用户的核心目标/问题；2) 关键进展与结论；3) 已使用的工具（仅列名称）；" +
  "4) 未完成事项。不要编造细节，信息不足时如实省略。";

/** P2: Provider 上下文溢出错误的常见措辞（OpenAI / DeepSeek / Anthropic 等）。 */
const CONTEXT_OVERFLOW_PATTERNS = [
  /context length/i,
  /context window/i,
  /maximum context/i,
  /max context/i,
  /too many tokens/i,
  /token limit/i,
  /prompt is too long/i,
  /maximum prompt length/i,
  /input is too long/i,
  /context_length_exceeded/i,
  /tokens per request/i,
  /window.*exceeded/i,
];

/** P2: 判断错误是否为 provider 上下文窗口溢出（用于自动压缩重试）。 */
export function isContextOverflowError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${err.stack ?? ""}` : String(err);
  return CONTEXT_OVERFLOW_PATTERNS.some((p) => p.test(msg));
}

/**
 * P2: 溢出恢复的上下文压缩 — 保留 system + 首条用户指令 + 最近的完整轮次尾部，
 * 中间工具执行记录归档为一条 user 消息（避免切开 tool_call/tool_result 配对，
 * 也保留最近一次 steer 注入指令）。无法有效压缩时返回 null（不重试，直接抛错）。
 */
export function compactMessagesForOverflow(messages: Message[], keepTail = 12): Message[] | null {
  if (messages.length <= keepTail + 3) return null;

  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  let tailStart = Math.max(2, messages.length - keepTail);
  // 最近一次用户指令（可能为 steer 注入）不落入裁剪区
  if (lastUserIdx >= 2 && lastUserIdx < tailStart) tailStart = lastUserIdx;
  // 避免以孤儿 tool 结果开头（其 tool_call 消息已被裁剪）
  while (tailStart < messages.length && messages[tailStart].role === "tool") tailStart++;
  if (tailStart <= 2) return null;

  const droppedCount = tailStart - 2;
  const archiveNote: Message = {
    id: generateId("msg_"),
    role: "user",
    content:
      `[上下文压缩] 因上下文窗口溢出，中间 ${droppedCount} 条工具执行记录已归档。` +
      `请基于保留内容继续当前任务，不要重复执行已完成的工具调用。`,
    timestamp: Date.now(),
  };
  return [messages[0], archiveNote, ...messages.slice(tailStart)];
}

/**
 * P2: 轮内工具结果裁剪（maka activeToolResultPrune 思路）— 随 run 内消息累积，
 * 把保留尾部之外的早期大工具结果替换为短占位符，保护下一次 LLM 调用的窗口，
 * 与硬闸门（P1）协作：先裁剪再估算，尽量让 run 正常跑完而非强制收尾。
 * 原地修改 messages，返回是否发生了裁剪。
 */
export function pruneActiveToolResults(
  messages: Message[],
  opts?: { maxTotalBytes?: number; preserveTail?: number }
): boolean {
  const maxTotalBytes = opts?.maxTotalBytes ?? ACTIVE_TOOL_RESULT_TOTAL_BYTES;
  const preserveTail = opts?.preserveTail ?? ACTIVE_TOOL_RESULT_PRESERVE_TAIL;
  if (messages.length <= preserveTail + 2) return false;

  const toolResultIndices: number[] = [];
  let totalBytes = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "tool" && m.content) {
      const bytes = Buffer.byteLength(
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        "utf-8"
      );
      totalBytes += bytes;
      if (i < messages.length - preserveTail) toolResultIndices.push(i);
    }
  }
  if (totalBytes <= maxTotalBytes) return false;

  let pruned = 0;
  for (const idx of toolResultIndices) {
    if (totalBytes <= maxTotalBytes) break;
    const m = messages[idx];
    const contentStr = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    const removed = Buffer.byteLength(contentStr, "utf-8");
    messages[idx] = {
      ...m,
      content: `[Earlier tool result for ${m.name ?? "tool"}: content trimmed (${removed} bytes) to protect context window]`,
    };
    totalBytes -= removed;
    pruned++;
  }

  if (pruned > 0) {
    console.warn(
      `[Agent] Active tool result pruning: trimmed ${pruned} old tool result(s) (total: ${totalBytes}/${maxTotalBytes} bytes)`
    );
  }
  return pruned > 0;
}

/** 按窗口大小计算的保留余量（固定 4096 与窗口比例取小，小窗口有下限兜底）。 */
function contextReserveTokens(maxTokens: number): number {
  return Math.min(
    HARD_CONTEXT_RESERVE_TOKENS,
    Math.max(HARD_CONTEXT_RESERVE_MIN_TOKENS, Math.floor(maxTokens * HARD_CONTEXT_RESERVE_RATIO))
  );
}

/** 硬闸门触发阈值：窗口减去保留余量，至少保留 1 token。 */
function hardContextLimit(maxTokens: number): number {
  if (maxTokens <= 0) return 0;
  return Math.max(1, maxTokens - contextReserveTokens(maxTokens));
}

/** 将消息内容归一化为纯文本（ContentPart 数组仅取文本部分，图片标记省略）。 */
function messageContentToText(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content.map((p) => (p.type === "text" ? p.text : `[${p.type}]`)).join("\n");
}

/**
 * 估算当前消息序列的上下文占用。
 * P1: provider 真实 usage 优先（上轮实测 totalTokens 为基线 + 尾部增量估算），
 * 无实测数据时回退为全文纯文本估算（pi 的真实 usage 优先 + 估算回退模式）。
 */
function estimateContextTokens(
  messages: Message[],
  lastUsageTotalTokens?: number,
  lastUsageMessageCount?: number
): number {
  if (
    lastUsageTotalTokens !== undefined &&
    lastUsageMessageCount !== undefined &&
    messages.length > lastUsageMessageCount
  ) {
    const delta = defaultTokenEstimator(
      messages
        .slice(lastUsageMessageCount)
        .map((m) => `${m.role}: ${messageContentToText(m.content)}`)
        .join("\n")
    );
    return lastUsageTotalTokens + delta;
  }
  return defaultTokenEstimator(
    messages.map((m) => `${m.role}: ${messageContentToText(m.content)}`).join("\n")
  );
}

/** Events yielded by Agent.runStreaming() — enables real-time observation of the agent loop */
export type StreamEvent =
  | { type: "chunk"; content: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; result: string; durationMs: number; success: boolean }
  | { type: "steer_injected"; prompt: string }
  | { type: "followup_injected"; prompt: string }
  | { type: "response"; content: string }
  | { type: "error"; message: string };

/** P2.3: 从工具结果提取同轮新增工具（协议: `[addedToolNames: a,b,c]` 前缀行） */
function extractAddedToolNames(result: string): string[] {
  const m = result.match(/^\[addedToolNames:\s*([^\]]+)\]/m);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * P1: Completion requirement — harness-level enforcement that the agent
 * MUST call a specific tool before finishing. If the agent stops without
 * calling it, the harness injects a reminder and retries (up to maxRetries).
 */
export interface CompletionRequirement {
  /** Tool name that must be called (e.g. "complete_task") */
  tool: string;
  /** Reminder injected when agent stops without calling the tool */
  reminder: string;
  /** Max retries, default 3 */
  maxRetries?: number;
}

export interface AgentRunOptions {
  onChunk?: (chunk: string) => void;
  onThinking?: (reasoningContent: string, durationMs?: number) => void;
  onIntermediateMessage?: (content: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>, toolCallId?: string) => void;
  onToolEnd?: (
    name: string,
    result: string,
    durationMs: number,
    success: boolean,
    toolCallId?: string,
    artifactRef?: string
  ) => void;
  onSteerInjected?: (prompt: string) => void;
  onFollowUpInjected?: (prompt: string) => void;
  hooks?: HookRegistry;
  sessionId?: string;
  /**
   * 调用表面（与 PermissionPolicy surface 对齐）
   * 如 tui | web | web-sse | desktop | telegram | api | cli …
   * 传给 ToolRegistry.execute() 的 channel 字段以激活 PermissionPolicy 矩阵
   */
  channel?: SurfaceType | ChannelType;
  // W1.3: 当前 Work ID (1:1 映射 sessionId)，供内置工具 update_work_plan 更新 plan
  workId?: string;
  /** W1.3: WorkManager 实例，供内置工具 update_work_plan 写入 plan 到文件 */
  workManager?: WorkManager;
  /**
   * 无痕模式（Incognito）：本 Work 的所有对话不写入任何记忆。
   * - session 记忆（每次对话摘要）跳过
   * - 自然语言「请记住」与 save_memory 工具被拦截/跳过
   * 由 HarnessRuntime 从 Work.metadata.incognito 读取并透传。
   */
  incognito?: boolean;
  /**
   * Per-call 交互式审批 handler（如 API server 的 SSE confirm_required + /api/tools/approve）。
   * 优先于构造时的 this.onToolApproval，使交互式审批在非 TUI 表面真正生效。
   */
  onToolApproval?: ToolApprovalHandler;
  /**
   * 结构化向用户提问（供 ask_user_question 等工具使用）。
   * 由交互面（TUI/Web）注入；未注入时工具降级为提示等待。
   */
  onUserQuestion?: (question: string, options: string[]) => Promise<string | undefined>;
  /** P0-2: 当前会话是否处于计划模式（只读探索 + 计划编写） */
  planMode?: boolean;
  /** P0-2: 会话模式读写访问（供 enter/exit_plan_mode 工具使用） */
  sessionMode?: import("../tools/types.js").ToolExecContext["sessionMode"];
  /** P0-3: 后台任务管理器（后台命令任务） */
  backgroundTasks?: import("../tools/types.js").ToolExecContext["backgroundTasks"];
  /** P0-3: 子 Agent 委派器（统一任务查询/等待/终止工具） */
  subAgents?: import("../tools/types.js").ToolExecContext["subAgents"];
  /**
   * Session-scoped trust level — overrides the surface-level policy for this execution.
   * - "minimal":  only safe tools; writes/commands still ask (bot/external channels)
   * - "standard": workspace-internal writes auto-allowed, commands still ask (Desktop default)
   * - "elevated": all needs_confirm auto-allowed; only dangerous asks (user said "go ahead")
   * - "full":     allow-all; equivalent to TUI (fully trusted local session)
   * If omitted, falls back to the surface-level policy default.
   */
  trustLevel?: SessionTrustLevel;
  /**
   * Cancellation signal — allows aborting long-running LLM completions or tool commands.
   */
  signal?: AbortSignal;
  /**
   * W2.2: 每次触发 onToolApproval 回调之前调用，用于写入 approval_requested 事件
   * （可由 HarnessRuntime 或 server 层注入）
   */
  onApprovalRequested?: (info: {
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    permission: string;
    /** 预检 diff（文件编辑类工具由 runtime 生成，随事件落库并回传） */
    diff?: string;
  }) => void | Promise<void | { diff?: string }>;
  /**
   * P1: Completion requirement — harness enforces that the agent must call
   * the specified tool before finishing. If the agent stops without it,
   * the harness injects the reminder and retries.
   */
  completionRequirement?: CompletionRequirement;
  /**
   * P2-B8: 每次 LLM 调用完成后上报该次用量与费用。
   * Harness 汇总后写入 run_finished 事件与 RuntimeOutput.usage。
   */
  onUsage?: (usage: NormalizedUsage & { costUsd?: number; model?: string }) => void;
  /**
   * H3.5: 单次 run 的派生预算（子 Agent 派发额度）。
   * 累计该 run 内所有 LLM 调用的 token 总量 / 估算费用，超出任一上限即优雅收尾，
   * 返回预算用尽摘要（而非中断异常）。未设置时不做限制。
   */
  usageBudget?: {
    /** Token 总量上限（input + output + cache） */
    maxTokens?: number;
    /** 估算美元费用上限 */
    maxCostUSD?: number;
  };
  /**
   * P2: 能力面过滤 — 仅允许列出的工具（子 Agent 角色化：explore/plan/reviewer 只读面）。
   * 未设置时不限制。过滤同时作用于工具公布与执行（硬拦截，不依赖模型自觉）。
   */
  allowedTools?: string[];
  /**
   * P2-3: 本次 run 的思考强度显式覆盖。
   * - "none": 关闭 thinking（传输层发 thinking.type=disabled / reasoning.effort=none）
   * - low | medium | high: 透传 reasoning_effort
   * 优先级高于 autoModelRouting 的 proReasoningEffort 路由结果（子代理默认 none）。
   */
  reasoningEffort?: "none" | "low" | "medium" | "high";
  /**
   * 用户附带的图片/文件附件，转为 `image_url` ContentPart 附加到本轮用户消息。
   * 主模型无多模态能力时由视觉协助（vision companion）描述后注入文本。
   */
  attachments?: RuntimeAttachment[];
  /**
   * 视觉协助调用完成后的回调（Harness 用于写入事件与用量汇总）。
   */
  onVisionCompanionCall?: (info: {
    model: string;
    imageCount: number;
    cacheHits: number;
    usage?: NormalizedUsage & { costUsd?: number };
  }) => void;
}

export interface AgentOptions {
  llm: LLMProvider;
  tools: ToolRegistry;
  memory: MemoryManager;
  skills?: SkillRegistry;
  contextBuilder?: ContextBuilder;
  personalContextLoader?: PersonalContextLoader;
  hooks?: HookRegistry;
  maxToolRounds?: number;
  /** Context budget — fed from config.context */
  maxTokens?: number;
  /**
   * P2.9: ContextBuilder 组装 system prompt 的 token 预算（用户级上下文预算，
   * 默认 config.context.maxTokens）。与 maxTokens（模型窗口硬上限）解耦：
   * 预算控制「喂给模型的 system prompt 体积」，窗口控制「对话历史物理上限」。
   */
  contextPromptBudget?: number;
  summaryThreshold?: number;
  mode?: "fast" | "normal" | "thoughtful";
  onToolApproval?: ToolApprovalHandler;
  onUserQuestion?: (question: string, options: string[]) => Promise<string | undefined>;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (
    name: string,
    result: string,
    durationMs: number,
    success: boolean,
    toolCallId?: string,
    artifactRef?: string
  ) => void;
  /** 当前连接的基础模型 id（B6 路由 fallback 与用量上报默认值） */
  modelId?: string;
  /** P2-B6: 自动模型路由配置（未启用时始终使用 modelId） */
  autoModelRouting?: AutoModelRoutingConfig;
  /** 当前连接可用的模型列表（B6 路由候选） */
  availableModels?: string[];
  /** 视觉协助（"模型的眼睛"）：为无多模态能力的主模型描述图片 */
  visionCompanion?: VisionCompanion | null;
  /** 当前连接是否支持视觉输入（未指定时按模型 id 自动判定） */
  modelHasVision?: boolean;
  /** P1.6: 数据目录（大工具结果归档到 {dataDir}/artifacts） */
  dataDir?: string;
  /** P2.3: 延迟工具注入 — 每轮只公布核心工具 + 已用工具（默认关闭） */
  deferredToolInjection?: boolean;
  /** P2.6: 文件历史快照存储（写工具自动捕获 before 快照，供 /rewind 使用） */
  fileHistory?: FileHistoryStore;
}

/**
 * Agent core execution loop
 */
interface RunState {
  activeSkill?: string;
  pendingTermination: boolean; // P2: set by terminatesSession tools
  pendingSteerPrompt: string | null;
  followUpQueue: string[];
  /** 拒绝熔断：per-tool 拒绝计数 + 总拒绝计数（每轮 run 重置） */
  rejectionCounts: Map<string, number>;
  totalRejections: number;
  /** P1: Tools called during the current run — completion requirement enforcement */
  toolsCalledThisRun: Set<string>;
  /** P2.3: 本轮内由工具结果（addedToolNames 协议）新增公布的工具 */
  addedToolNamesThisTurn: Set<string>;
  /** P2.9: 本 run 已发生的软阈值自动压缩次数（防循环） */
  autoCompactCount: number;
}

function createRunState(): RunState {
  return {
    pendingTermination: false,
    pendingSteerPrompt: null,
    followUpQueue: [],
    rejectionCounts: new Map(),
    totalRejections: 0,
    toolsCalledThisRun: new Set(),
    addedToolNamesThisTurn: new Set(),
    autoCompactCount: 0,
  };
}

export class Agent {
  private llm: LLMProvider;
  private tools: ToolRegistry;
  private memory: MemoryManager;
  private skills?: SkillRegistry;
  private contextBuilder: ContextBuilder;
  private personalContextLoader?: PersonalContextLoader;
  private hooks?: HookRegistry;
  private maxToolRounds: number;
  private contextMaxTokens: number;
  private contextPromptBudget: number;
  private contextMode: "fast" | "normal" | "thoughtful";
  private contextSummaryThreshold: number;
  /**
   * Re-entrancy-safe per-run state. Agent.run() can be re-entered by sub-agents
   * (SubAgentDelegator calls the same runtime/agent instance) and by recursive
   * executeRun continuations; each nested run gets its own state so parent and
   * child never clobber each other's tool sets, steer queues or rejection
   * counters.
   */
  private runStateStack: RunState[] = [];
  /** Follow-ups queued while the agent is idle (consumed by the next run). */
  private pendingFollowUps: string[] = [];
  private readonly maxRejectionsPerTool = 2;
  private readonly maxTotalRejections = 3;

  private get runState(): RunState {
    const top = this.runStateStack[this.runStateStack.length - 1];
    if (!top) {
      throw new Error("Agent runState accessed outside of a run");
    }
    return top;
  }

  private onToolApproval?: ToolApprovalHandler;
  private onUserQuestion?: (question: string, options: string[]) => Promise<string | undefined>;
  private onToolStart?: (name: string, args: Record<string, unknown>) => void;
  private onToolEnd?: (
    name: string,
    result: string,
    durationMs: number,
    success: boolean,
    toolCallId?: string,
    artifactRef?: string
  ) => void;
  private modelId?: string;
  private autoModelRouting?: AutoModelRoutingConfig;
  private availableModels?: string[];
  private visionCompanion?: VisionCompanion | null;
  private modelHasVision?: boolean;
  private dataDir?: string;
  private deferredToolInjection?: boolean;
  private fileHistory?: FileHistoryStore;

  constructor(options: AgentOptions) {
    this.llm = options.llm;
    this.tools = options.tools;
    this.memory = options.memory;
    this.skills = options.skills;
    this.contextBuilder = options.contextBuilder ?? new ContextBuilder();
    this.personalContextLoader = options.personalContextLoader;
    this.hooks = options.hooks;
    this.maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
    // P2.9: maxTokens = 模型窗口推断值（硬闸门/压缩阈值基线），
    // 不再直接吃用户全局预算 — 用户预算走 contextPromptBudget（ContextBuilder）。
    this.contextMaxTokens = options.maxTokens ?? DEFAULT_TOKEN_BUDGET;
    this.contextPromptBudget = options.contextPromptBudget ?? this.contextMaxTokens;
    this.contextMode = options.mode ?? "normal";
    this.contextSummaryThreshold = options.summaryThreshold ?? 25;
    this.onToolApproval = options.onToolApproval;
    this.onUserQuestion = options.onUserQuestion;
    this.onToolStart = options.onToolStart;
    this.onToolEnd = options.onToolEnd;
    this.modelId = options.modelId;
    this.autoModelRouting = options.autoModelRouting;
    this.availableModels = options.availableModels;
    this.visionCompanion = options.visionCompanion;
    this.modelHasVision = options.modelHasVision;
    this.dataDir = options.dataDir;
    this.deferredToolInjection = options.deferredToolInjection;
    this.fileHistory = options.fileHistory;

    // B4: 自动注册 activate_skill 工具，由大模型显式调用
    if (this.skills) {
      try {
        this.tools.register(
          this.skills.getActivationTool((skillName) => {
            this.runState.activeSkill = skillName;
            console.log(`[Skill] 显式激活技能: ${skillName}`);
          })
        );
      } catch {
        /* ignore if already registered */
      }
    }
  }

  /**
   * P2.9: 模型上下文窗口（硬闸门/压缩阈值基线，由 runtime 按激活模型推断）。
   * 供 PostTurnHook 与子代理预算等外部模块读取，避免再绕回用户组装预算。
   */
  get contextWindowTokens(): number {
    return this.contextMaxTokens;
  }

  /**
   * P2.9: 用当前模型把一段会话历史总结为语义摘要（Claude Code Summary API 模式）。
   * 输入先降维（仅用户问题 + 工具名，截断），输出限长；
   * 失败返回空串，由调用方（SessionManager.autoCompact）回退到静态归档注记。
   */
  async summarizeMessages(messages: Message[]): Promise<string> {
    const lines: string[] = [];
    for (const m of messages) {
      const text = messageContentToText(m.content).trim();
      if (m.role === "user" && text) {
        lines.push(`用户: ${text.slice(0, 200)}`);
      } else if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
        lines.push(`工具: ${m.tool_calls.map((tc) => tc.name).join(", ")}`);
      }
    }
    const input = lines.join("\n").slice(0, 20000);
    if (!input.trim()) return "";
    const now = Date.now();
    try {
      const resp = await this.llm.chat(
        [
          {
            id: generateId("msg_"),
            role: "system",
            content: SESSION_SUMMARY_PROMPT,
            timestamp: now,
          },
          { id: generateId("msg_"), role: "user", content: input, timestamp: now },
        ],
        [],
        { maxTokens: 1024, model: this.modelId }
      );
      return resp.content?.trim() ?? "";
    } catch (err) {
      console.warn(
        `[Agent] summarizeMessages failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return "";
    }
  }

  /** 当前 Agent 是否正在运行 Tool Loop 循环（含嵌套的子 Agent 运行） */
  isRunning(): boolean {
    return this.runStateStack.length > 0;
  }

  /**
   * C6: 中途转向 (Mid-turn Steer)
   * 在 Agent 处于 Tool Loop 执行中途时，动态插入修正指令
   */
  steer(prompt: string): boolean {
    if (!this.isRunning()) {
      return false;
    }
    this.runState.pendingSteerPrompt = prompt.trim();
    console.log(`[Agent] 收到中途转向指令 (steer): "${this.runState.pendingSteerPrompt}"`);
    return true;
  }

  /**
   * C6: 连续跟进 (Follow-up)
   * 在当前对话轮次结束后自动排队执行下一条 Prompt
   */
  followUp(prompt: string): void {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (this.isRunning()) {
      this.runState.followUpQueue.push(trimmed);
    } else {
      this.pendingFollowUps.push(trimmed);
    }
    console.log(`[Agent] 追加跟进指令 (followUp): "${trimmed}"`);
  }

  /** 清空 pendingSteer */
  clearSteer(): void {
    if (this.runStateStack.length > 0) {
      this.runState.pendingSteerPrompt = null;
    }
  }

  /**
   * Execute a conversation turn, yielding events as they happen.
   * Wraps `run()` with an event queue — no internal refactoring needed.
   * Callers that need real-time observation (coordinator, streaming UI) use this.
   */
  async *runStreaming(
    userInput: string,
    history: Message[] = [],
    options?: AgentRunOptions
  ): AsyncGenerator<StreamEvent, void, unknown> {
    type Event = { type: string; [key: string]: unknown };
    const buffer: Event[] = [];
    let finished = false;
    let error: Error | null = null;
    let wake: (() => void) | null = null;

    const emit = (e: Event) => {
      buffer.push(e);
      wake?.();
    };

    // Fire run() in background; it pushes events via callbacks
    const runPromise = this.run(userInput, history, {
      ...options,
      onChunk: (c) => emit({ type: "chunk", content: c }),
      onToolStart: (n, a) => emit({ type: "tool_start", name: n, args: a }),
      onToolEnd: (n, r, d, s) =>
        emit({ type: "tool_end", name: n, result: r, durationMs: d, success: s }),
      onSteerInjected: (p) => emit({ type: "steer_injected", prompt: p }),
      onFollowUpInjected: (p) => emit({ type: "followup_injected", prompt: p }),
    }).then(
      (content) => {
        emit({ type: "_done", content });
        finished = true;
        wake?.();
      },
      (err) => {
        error = err;
        finished = true;
        wake?.();
      }
    );

    // Drain buffer, yielding events as they arrive
    while (!finished || buffer.length > 0) {
      if (buffer.length > 0) {
        const event = buffer.shift()!;
        if (event.type === "_done") {
          yield { type: "response", content: event.content as string };
          return;
        }
        yield event as StreamEvent;
      } else if (!finished) {
        await new Promise<void>((r) => {
          wake = r;
        });
      }
    }

    if (error) {
      yield { type: "error", message: (error as Error).message };
    }
  }

  /**
   * 执行一轮对话
   */
  async run(
    userInput: string,
    history: Message[] = [],
    options?: AgentRunOptions
  ): Promise<string> {
    const state = createRunState();
    state.followUpQueue = this.pendingFollowUps.splice(0);
    this.runStateStack.push(state);
    try {
      return await this.executeRun(userInput, history, options);
    } finally {
      this.runStateStack.pop();
    }
  }

  /**
   * P2.3: 计算本轮公布给模型的工具集。
   * 延迟模式：核心未分组工具 + 本轮已调用工具 + 本轮新增（addedToolNames）始终公布；
   * 分组工具（browser/search/git 等）在首次使用或显式加载前不进入 provider 工具列表。
   */
  private computeAdvertisedTools(): ToolDefinition[] {
    const all = this.tools.list();
    if (!this.deferredToolInjection) return all;
    const keep = new Set<string>();
    const state = this.runState;
    for (const t of all) {
      if (!t.group || t.name === "load_tools" || t.name === "tool_search") keep.add(t.name);
      if (state.toolsCalledThisRun.has(t.name)) keep.add(t.name);
      if (state.addedToolNamesThisTurn.has(t.name)) keep.add(t.name);
    }
    return all.filter((t) => keep.has(t.name));
  }

  private async executeRun(
    userInput: string,
    history: Message[] = [],
    options?: AgentRunOptions
  ): Promise<string> {
    const input = userInput.trim();

    // 1. 自然语言记住 (W5.5.4: 经过标准 ToolRegistry 管道与 RuntimeEvent 留痕)
    const rememberPrefixes = ["请记住", "记住", "帮我记一下", "记一下"];
    for (const prefix of rememberPrefixes) {
      if (input.startsWith(prefix)) {
        const content = input
          .slice(prefix.length)
          .replace(/^[：:\s]+/, "")
          .trim();
        if (content) {
          // 无痕模式：不落任何记忆，直接告知用户已跳过
          if (options?.incognito) {
            const reply = "无痕模式已开启，本次内容不会写入记忆。";
            if (options?.onChunk) options.onChunk(reply);
            return reply;
          }
          // 动态注册 save_memory 确保在工具管道中可被找到与记录
          if (!this.tools.get("save_memory")) {
            this.tools.register({
              name: "save_memory",
              description: "保存重要的用户偏好、事实或决策到长期记忆中",
              permission: "safe",
              parameters: {
                type: "object",
                properties: {
                  content: { type: "string", description: "需要记住的具体信息" },
                },
                required: ["content"],
              },
              execute: async (args) => {
                const text = String(args.content ?? "").trim();
                this.memory.add({
                  layer: "long_term",
                  content: text,
                  importance: 0.75,
                  source: "user",
                });
                return `好的，我已经记住了：${text}`;
              },
            });
          }

          const channel = options?.channel ?? "api";
          const toolStartHandler = options?.onToolStart ?? this.onToolStart;
          const toolEndHandler = options?.onToolEnd ?? this.onToolEnd;
          if (toolStartHandler) {
            toolStartHandler("save_memory", { content });
          }

          const reply = await this.tools.execute("save_memory", { content }, { channel });

          if (toolEndHandler) {
            toolEndHandler("save_memory", reply, 0, true);
          }

          if (options?.onChunk) options.onChunk(reply);
          return reply;
        } else {
          const reply = "请告诉我需要记住的具体内容，例如：请记住我喜欢喝手冲咖啡";
          if (options?.onChunk) options.onChunk(reply);
          return reply;
        }
      }
    }

    // 2. B3: 混合向量记忆检索
    const relevantMemories = this.memory.search(input, {
      layers: ["session", "long_term"],
      limit: 6,
      minImportance: 0.3,
    });

    const personalCtx = this.personalContextLoader ? this.personalContextLoader.load() : undefined;

    // 3. 组装上下文（包含 B4 显式激活的技能与 PC 个人上下文）
    const built = await this.contextBuilder.build({
      userInput: input,
      memories: relevantMemories,
      skills: this.skills,
      tools: this.tools,
      activeSkill: this.runState.activeSkill,
      personalContext: personalCtx
        ? {
            soul: personalCtx.soul,
            telos: personalCtx.telos,
            knowledgeRoot: personalCtx.knowledgeRoot,
            knowledgeWriteRoot: personalCtx.knowledgeWriteRoot,
          }
        : undefined,
      history,
      options: {
        maxTokens: this.contextPromptBudget,
        mode: this.contextMode,
        summaryThreshold: this.contextSummaryThreshold,
      },
      tokenEstimator: defaultTokenEstimator,
    });

    // 4. 构建底层的 API 请求报文消息序列
    const messages: Message[] = [
      {
        id: generateId("msg_"),
        role: "system",
        content: built.systemPrompt,
        timestamp: Date.now(),
      },
      ...history,
      {
        id: generateId("msg_"),
        role: "user",
        content: input,
        timestamp: Date.now(),
      },
    ];

    // 4b. 用户附件 → image_url ContentPart（视觉协助在每轮调用前处理）
    if (options?.attachments && options.attachments.length > 0) {
      const userMsg = messages[messages.length - 1];
      const parts: ContentPart[] = [];
      if (typeof userMsg.content === "string" && userMsg.content.trim()) {
        parts.push({ type: "text", text: userMsg.content });
      } else if (Array.isArray(userMsg.content)) {
        parts.push(...userMsg.content);
      }
      for (const att of options.attachments) {
        const part = attachmentToImagePart(att);
        if (part) parts.push(part);
      }
      userMsg.content = parts;
    }

    // 5. 工具调用循环（H3.5: 派生预算累计）
    let spentTokens = 0;
    let spentCostUsd = 0;
    // P1: 最近一次 provider 实测的上下文占用（totalTokens）与当时消息数，
    // 供硬闸门估算做真实 usage 校准基线。
    let lastUsageTotalTokens: number | undefined;
    let lastUsageMessageCount = 0;
    // P2: 上下文溢出自动压缩重试 — 同一 run 内仅恢复一次（防重入）
    let overflowRetried = false;
    let rounds = 0;
    while (rounds < this.maxToolRounds) {
      rounds++;
      const roundStart = Date.now();

      // C6: 检查是否有中途插队的 steer 指令
      if (this.runState.pendingSteerPrompt) {
        const steerMsg = this.runState.pendingSteerPrompt;
        this.runState.pendingSteerPrompt = null;

        messages.push({
          id: generateId("msg_"),
          role: "user",
          content: `[用户中途转向修正指令]: ${steerMsg}`,
          timestamp: Date.now(),
        });
        if (options?.onSteerInjected) options.onSteerInjected(steerMsg);
        console.log(`[Agent] 中途转向指令已成功注入当前上下文: "${steerMsg}"`);
      }

      // P2: 轮内工具结果裁剪 — 早期大结果替换为占位符（maka activeToolResultPrune），
      // 在硬闸门估算之前执行，让估算反映裁剪后的真实窗口占用。
      if (rounds >= 2) {
        pruneActiveToolResults(messages);
      }

      // P2: 能力面过滤（子 Agent 角色化）— 只公布 allowedTools 内的工具
      let toolDefs = this.computeAdvertisedTools();
      if (options?.allowedTools && options.allowedTools.length > 0) {
        const allow = new Set(options.allowedTools);
        toolDefs = toolDefs.filter((t) => allow.has(t.name));
      }

      // P2.4: 激活技能的 allowedTools 收窄工具面（技能只看到它被允许使用的工具；
      // 始终保留发现/激活/提问工具以便模型按需扩展或退出技能）
      if (this.runState.activeSkill && this.skills) {
        const skill = this.skills.get(this.runState.activeSkill);
        if (skill?.allowedTools && skill.allowedTools.length > 0) {
          const allow = new Set(skill.allowedTools);
          toolDefs = toolDefs.filter(
            (t) =>
              allow.has(t.name) ||
              t.name === "activate_skill" ||
              t.name === "load_tools" ||
              t.name === "tool_search" ||
              t.name === "ask_user_question"
          );
        }
      }

      // P2-B6: 每轮调用前路由模型（轻/重 + reasoning effort）；未启用时保持默认模型。
      // P2-3: 显式 options.reasoningEffort 优先于路由结果（子代理默认 "none" 关思考）。
      let callModel = this.modelId;
      let callReasoningEffort = options?.reasoningEffort;
      if (this.autoModelRouting?.enabled) {
        const route = resolveAutoModelRoute({
          prompt: input,
          recentTools: Array.from(this.runState.toolsCalledThisRun),
          historyLength: history.length,
          planMode: options?.planMode,
          availableModels: this.availableModels,
          defaultModelId: this.modelId,
          config: this.autoModelRouting,
          // 上下文含图片时优先路由到视觉模型（未配置视觉协助的前提下）
          hasImages: hasImageContent(messages),
          visionRouting: !(this.visionCompanion?.isConfigured() ?? false),
        });
        callModel = route.modelId;
        if (!callReasoningEffort) callReasoningEffort = route.reasoningEffort;
      }

      // P2.8/P1: 硬性上下文预算闸门 — 校准后的上下文估算超过「窗口 − 保留余量」
      // 时，强制以空工具面生成最终结论，防止 run 内无限膨胀（此前只有建议性
      // 提醒，模型可无视；P1 起使用真实 usage 校准并提前到窗口内触发）。
      if (rounds >= 2 && this.contextMaxTokens > 0) {
        const estTokens = estimateContextTokens(
          messages,
          lastUsageTotalTokens,
          lastUsageMessageCount
        );
        // P2.9: 软阈值自动压缩 — 未达硬闸门但超过窗口 75% 时，主动归档中间
        // 工具执行记录（Claude Code auto-compact / Kun 75% 软阈值模式），
        // 避免上下文一路膨胀到硬闸门才被迫总结。每 run 最多 2 次防循环。
        if (rounds >= 4 && this.runState.autoCompactCount < MAX_AUTO_COMPACT_PER_RUN) {
          const softLimit = Math.floor(this.contextMaxTokens * SOFT_COMPACT_RATIO);
          if (estTokens > softLimit) {
            const compacted = compactMessagesForOverflow(messages);
            if (compacted) {
              this.runState.autoCompactCount += 1;
              const pct = ((estTokens / this.contextMaxTokens) * 100).toFixed(0);
              console.warn(
                `[Agent] Auto-compact triggered at ${pct}% (soft limit ${softLimit}) — ` +
                  `archived middle tool records (attempt ${this.runState.autoCompactCount}/${MAX_AUTO_COMPACT_PER_RUN})`
              );
              messages.length = 0;
              messages.push(...compacted);
              continue;
            }
          }
        }
        const hardLimit = hardContextLimit(this.contextMaxTokens);
        if (estTokens > hardLimit) {
          const pct = ((estTokens / this.contextMaxTokens) * 100).toFixed(0);
          console.warn(
            `[Agent] Hard context budget exceeded (${pct}%, limit ${hardLimit}) — forcing final answer without tools`
          );
          messages.push({
            id: generateId("msg_"),
            role: "user",
            content:
              `[硬性预算限制] 当前上下文估算已使用约 ${pct}%（${estTokens}/${this.contextMaxTokens} tokens），超过安全上限。` +
              `立即停止所有工具调用，仅基于当前已收集的信息直接输出最终结论，不要再尝试读取文件或派发子代理。`,
            timestamp: Date.now(),
          });
          try {
            const finalResponse = await this.llm.chat(messages, [], {
              signal: options?.signal,
              model: callModel ?? this.modelId,
            });
            const finalContent = finalResponse?.content ?? "";
            messages.push({
              id: generateId("msg_"),
              role: "assistant",
              content: finalContent,
              timestamp: Date.now(),
            });
            if (!options?.incognito) {
              this.memory.add({
                layer: "session",
                content: `用户: ${input}\n助手: ${finalContent}`,
                importance: 0.4,
              });
            }
            if (options?.onChunk) options.onChunk(finalContent);
            return finalContent;
          } catch (err) {
            // 兜底：LLM 调用失败时返回硬停止说明，避免空答
            const fallback = `[硬性预算限制] 上下文已超限（约 ${pct}%），且最终结论生成失败。基于已收集信息，请简要总结当前进展。`;
            if (options?.onChunk) options.onChunk(fallback);
            return fallback;
          }
        }
      }

      // "模型的眼睛"：主模型无多模态能力时，由视觉协助模型描述图片后以文本注入
      await preprocessVisualContent(messages, {
        modelId: callModel ?? this.modelId ?? "default",
        modelHasVision: this.modelHasVision,
        companion: this.visionCompanion,
        signal: options?.signal,
        onCompanionCall: options?.onVisionCompanionCall,
      });

      // P2-B5: connect/idle watchdog on streaming calls; non-streaming fallback
      // runs directly (no chunk boundary to supervise).
      // P2: provider 上下文溢出 → 压缩一次并重试（pi / Claude Code 模式），
      // 重试仍失败则原样抛出（外层 harness 错误边界兜底）。
      let response: LLMResponse;
      try {
        response = this.llm.chatStream
          ? await withStreamWatchdog(
              {
                onTimeout: (phase) =>
                  console.log(
                    `[Agent] 模型流 ${phase === "connect" ? "连接" : "空闲"}超时，正在中止`
                  ),
              },
              async (watchdogSignal, activity) => {
                const mergedSignal = options?.signal
                  ? AbortSignal.any([options.signal, watchdogSignal])
                  : watchdogSignal;
                const onChunk = options?.onChunk
                  ? (c: string) => {
                      activity();
                      options.onChunk!(c);
                    }
                  : undefined;
                return await this.llm.chatStream!(messages, toolDefs, onChunk, {
                  signal: mergedSignal,
                  model: callModel,
                  ...(callReasoningEffort ? { reasoningEffort: callReasoningEffort } : {}),
                  // 服务端执行工具（如 DeepSeek web_search）的观测回调：
                  // 传输层检测到 provider 已自行执行工具时直接触发，
                  // 与本地工具共用同一条 tool_call / tool_result 事件链。
                  onServerToolStart: options?.onToolStart,
                  onServerToolEnd: options?.onToolEnd,
                });
              }
            )
          : await this.llm.chat(messages, toolDefs, {
              signal: options?.signal,
              model: callModel,
              ...(callReasoningEffort ? { reasoningEffort: callReasoningEffort } : {}),
              onServerToolStart: options?.onToolStart,
              onServerToolEnd: options?.onToolEnd,
            });
      } catch (err) {
        if (!overflowRetried && isContextOverflowError(err)) {
          const compacted = compactMessagesForOverflow(messages);
          if (compacted) {
            overflowRetried = true;
            console.warn(
              `[Agent] Provider context overflow detected — compacted ${messages.length - compacted.length} messages, retrying once`
            );
            messages.length = 0;
            messages.push(...compacted);
            continue;
          }
        }
        throw err;
      }

      // P2-B8: 上报本次 LLM 调用的用量（transport 已归一化并估算费用）
      if (response.usage && options?.onUsage) {
        options.onUsage({
          ...response.usage,
          model: callModel ?? this.modelId,
        });
      }

      // H3.5: 子 Agent 派生预算 — 累计 token/费用，超限优雅收尾（返回部分摘要而非异常）
      if (response.usage) {
        spentTokens += response.usage.totalTokens ?? 0;
        spentCostUsd += response.usage.costUsd ?? 0;
        // P1: 记录本轮实测上下文占用，作为下一轮闸门估算的基线
        lastUsageTotalTokens = response.usage.totalTokens;
        lastUsageMessageCount = messages.length;
      }
      const budget = options?.usageBudget;
      const overTokenBudget = budget?.maxTokens !== undefined && spentTokens >= budget.maxTokens;
      const overCostBudget = budget?.maxCostUSD !== undefined && spentCostUsd >= budget.maxCostUSD;
      if (overTokenBudget || overCostBudget) {
        const budgetMsg = i18n().t("agent.subagent_budget_exhausted", {
          maxTokens: budget?.maxTokens ?? "∞",
          maxCostUSD: budget?.maxCostUSD ?? "∞",
        });
        console.log(
          `[Agent] Usage budget exhausted (tokens=${spentTokens}, costUsd=${spentCostUsd.toFixed(6)})`
        );
        // P2-3: 预算用尽不再直接返回一句空话 — 注入总结提示，用空工具面强制输出
        // 已完成的调研/执行要点（复用 P2.8 硬性闸门的收尾模式），LLM 失败再回退 budgetMsg。
        messages.push({
          id: generateId("msg_"),
          role: "user",
          content:
            `[预算用尽] 本 run 的派生预算已耗尽（累计 ${spentTokens} tokens，` +
            `上限 ${budget?.maxTokens ?? "∞"}）。立即停止所有工具调用，` +
            `仅基于当前已收集的信息直接输出最终结论与已完成要点，` +
            `不要尝试读取文件、搜索或派发子代理。`,
          timestamp: Date.now(),
        });
        try {
          const finalResponse = await this.llm.chat(messages, [], {
            signal: options?.signal,
            model: callModel ?? this.modelId,
          });
          const finalContent = finalResponse?.content ?? "";
          if (finalContent) {
            messages.push({
              id: generateId("msg_"),
              role: "assistant",
              content: finalContent,
              timestamp: Date.now(),
            });
            if (options?.onChunk) options.onChunk(finalContent);
            return finalContent;
          }
        } catch {
          /* 收尾总结失败 → 回退到预算用尽说明 */
        }
        messages.push({
          id: generateId("msg_"),
          role: "assistant",
          content: budgetMsg,
          timestamp: Date.now(),
        });
        return budgetMsg;
      }

      if (response.reasoning_content) {
        if (options?.onThinking) {
          options.onThinking(response.reasoning_content, Date.now() - roundStart);
        }
      }

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const finalContent = response.content ?? "";

        // P1: Completion requirement enforcement — harness-level contract
        const completion = options?.completionRequirement;
        const completionRetries = (options as any)?._completionRetries ?? 0;
        if (
          completion &&
          !this.runState.toolsCalledThisRun.has(completion.tool) &&
          completionRetries < (completion.maxRetries ?? 3)
        ) {
          const reminder = completion.reminder;
          console.log(
            `[Agent] Completion requirement not met — tool '${completion.tool}' not called. ` +
              `Retry ${completionRetries + 1}/${completion.maxRetries ?? 3}. Injecting reminder.`
          );
          messages.push({
            id: generateId("msg_"),
            role: "user",
            content: reminder,
            timestamp: Date.now(),
          });
          // Pass incremented retry count through options
          const retryOptions = {
            ...options,
            _completionRetries: completionRetries + 1,
          };
          return await this.executeRun(reminder, messages, retryOptions);
        }

        messages.push({
          id: generateId("msg_"),
          role: "assistant",
          content: finalContent,
          timestamp: Date.now(),
        });

        // 无痕模式：不写 session 记忆
        if (!options?.incognito) {
          this.memory.add({
            layer: "session",
            content: `用户: ${input}\n助手: ${finalContent}`,
            importance: 0.4,
          });
        }

        // C6: 检查是否有等待跟进的 followUp 任务
        if (this.runState.followUpQueue.length > 0) {
          const nextPrompt = this.runState.followUpQueue.shift()!;
          if (options?.onFollowUpInjected) options.onFollowUpInjected(nextPrompt);
          console.log(`[Agent] 自动触发跟进队列指令: "${nextPrompt}"`);
          return await this.executeRun(nextPrompt, messages, options);
        }

        return finalContent;
      }

      console.log(
        `[Agent ToolLoop Round ${rounds}] ToolCalls:`,
        response.tool_calls.map((c) => `${c.name}(${JSON.stringify(c.arguments)})`)
      );

      // 有工具调用：如果包含中间助手回答文本，触发回调通知记录
      const interContent = (response.content || "").trim();
      if (interContent && options?.onIntermediateMessage) {
        options.onIntermediateMessage(interContent);
      }

      messages.push({
        id: generateId("msg_"),
        role: "assistant",
        content: response.content ?? "",
        tool_calls: response.tool_calls,
        timestamp: Date.now(),
      });

      // P1: Partition tool calls into concurrent-safe and serial batches.
      // Read-only + safe tools can run in parallel; write/dangerous tools run serially.
      const { concurrent, serial } = this.partitionToolCalls(response.tool_calls);

      // Execute concurrent batch in parallel
      const concurrentResults = await Promise.all(
        concurrent.map((call) => this.executeOneTool(call, messages, options))
      );

      // Execute serial batch one at a time
      for (const call of serial) {
        await this.executeOneTool(call, messages, options);
      }

      // P2: If a terminatesSession tool signalled completion, stop immediately
      if (this.runState.pendingTermination) {
        const final = response.content ?? "Task completed.";
        messages.push({
          id: generateId("msg_"),
          role: "assistant",
          content: final,
          timestamp: Date.now(),
        });
        return final;
      }

      // P1: Post-turn hook — allows extensions to inject reminders after each round
      if (options?.hooks || this.hooks) {
        const hookRegistry = options?.hooks ?? this.hooks!;
        const estTokens = defaultTokenEstimator(
          messages
            .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
            .join("\n")
        );
        const postTurnResult = await hookRegistry.runPostTurn({
          messages,
          round: rounds,
          estimatedTokens: estTokens,
          sessionId: options?.sessionId,
        });
        if (postTurnResult.injectMessage) {
          messages.push({
            id: generateId("msg_"),
            role: "user",
            content: postTurnResult.injectMessage,
            timestamp: Date.now(),
          });
        }
      }
    }

    const stopMsg = `\n\n${i18n().t("agent.max_tool_rounds_reached")}`;
    if (options?.onChunk) {
      options.onChunk(stopMsg);
    }
    return stopMsg;
  }

  // ── P1: Tool Concurrency Partitioning ──────────────────────────────

  /** Derive concurrency safety: explicit flag > readOnly+safe heuristic > false */
  private isToolConcurrencySafe(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) return false;
    if (tool.isConcurrencySafe !== undefined) return tool.isConcurrencySafe;
    return tool.readOnly === true && tool.permission === "safe";
  }

  /** Split tool calls into concurrent-safe and serial batches */
  private partitionToolCalls(calls: ToolCall[]): {
    concurrent: ToolCall[];
    serial: ToolCall[];
  } {
    const concurrent: ToolCall[] = [];
    const serial: ToolCall[] = [];
    for (const call of calls) {
      if (this.isToolConcurrencySafe(call.name)) {
        concurrent.push(call);
      } else {
        serial.push(call);
      }
    }
    return { concurrent, serial };
  }

  /** Execute one tool call and append result to messages. Thread-safe for parallel calls. */
  private async executeOneTool(
    call: ToolCall,
    messages: Message[],
    options?: AgentRunOptions
  ): Promise<void> {
    this.runState.toolsCalledThisRun.add(call.name);
    const toolDef = this.tools.get(call.name);
    const permission = (toolDef?.permission ?? "safe") as ToolPermission;
    const toolStartHandler = options?.onToolStart ?? this.onToolStart;
    const toolEndHandler = options?.onToolEnd ?? this.onToolEnd;

    // P2: 能力面硬拦截 — 不在 allowedTools 内的工具直接拒绝（不依赖模型自觉）
    if (
      options?.allowedTools &&
      options.allowedTools.length > 0 &&
      !options.allowedTools.includes(call.name)
    ) {
      const deniedMsg = `[能力面拦截] 当前执行面不允许调用工具 ${call.name}（只读/角色受限）。请改用允许的工具或交由父 Agent 处理。`;
      messages.push({
        id: generateId("msg_"),
        role: "tool",
        content: deniedMsg,
        tool_call_id: call.id,
        name: call.name,
        timestamp: Date.now(),
      });
      if (toolEndHandler) toolEndHandler(call.name, deniedMsg, 0, false, call.id);
      return;
    }

    const startTime = Date.now();
    if (toolStartHandler) {
      toolStartHandler(call.name, call.arguments, call.id);
    }

    let approved = true;
    const approvalHandler = options?.onToolApproval ?? this.onToolApproval;
    const surface = (options?.channel ?? "api") as SurfaceType;
    const trustLevel = options?.trustLevel;
    const policyDecision = this.tools
      .getPermissionPolicy()
      .decide(surface, call.name, toolDef?.permission ?? "safe", trustLevel, toolDef?.kind);

    if (policyDecision === "deny") {
      approved = false;
    } else if (policyDecision === "require_approval") {
      const priorRejections = this.runState.rejectionCounts.get(call.name) || 0;
      if (priorRejections >= this.maxRejectionsPerTool) {
        this.runState.totalRejections++;
        const stopMsg = `[已停止] 工具 ${call.name} 已被拒绝 ${priorRejections} 次，请停止重试并向用户说明，或改用其他方式。`;
        messages.push({
          id: generateId("msg_"),
          role: "tool",
          content: stopMsg,
          tool_call_id: call.id,
          name: call.name,
          timestamp: Date.now(),
        });
        if (toolEndHandler) toolEndHandler(call.name, stopMsg, 0, false, call.id);
        return;
      }

      if (approvalHandler) {
        let pendingDiff: string | undefined;
        if (options?.onApprovalRequested) {
          const approvalId = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          try {
            const result = await options.onApprovalRequested({
              approvalId,
              toolName: call.name,
              args: call.arguments,
              permission,
            });
            pendingDiff = result && typeof result === "object" ? result.diff : undefined;
          } catch {
            /* non-blocking */
          }
        }
        approved = await approvalHandler(call.name, call.arguments, permission, pendingDiff, {
          channel: surface,
          trustLevel,
          toolKind: toolDef?.kind,
        });
      } else {
        approved = false;
      }
      if (!approved) {
        this.runState.rejectionCounts.set(call.name, priorRejections + 1);
        this.runState.totalRejections++;
      }
    }

    // P0-5: 将 Work 及其 workspaceRoot 传入工具执行链，
    // 使 PathJail / ToolSandbox 作用域跟随当前 Work 的项目根（而非注册时的默认 cwd）。
    const work =
      options?.workManager && options?.workId ? options.workManager.get(options.workId) : undefined;

    let result: string;
    if (!approved) {
      result = formatUserRejectionMessage(call.name);
    } else if (options?.incognito && call.name === "save_memory") {
      // 无痕模式：拦截 save_memory 工具，不写入长期记忆
      result = "无痕模式已开启，已跳过保存到记忆（本次对话不会写入记忆）。";
    } else {
      result = await this.tools.execute(call.name, call.arguments, {
        confirm: approved,
        onToolApproval: approvalHandler,
        onUserQuestion: options?.onUserQuestion ?? this.onUserQuestion,
        hooks: options?.hooks || this.hooks,
        context: { fileHistory: this.fileHistory },
        sessionId: options?.sessionId,
        channel: options?.channel,
        trustLevel: options?.trustLevel,
        signal: options?.signal,
        workId: options?.workId,
        workManager: options?.workManager,
        work: work ?? undefined,
        workspaceRoot: work?.workspaceRoot,
        planMode: options?.planMode,
        sessionMode: options?.sessionMode,
        backgroundTasks: options?.backgroundTasks,
        subAgents: options?.subAgents,
        onSessionTerminate: () => {
          this.runState.pendingTermination = true;
        },
      });
    }

    // "模型的眼睛"：工具可注册截图等图片，这里剥离标记并把图片作为
    // 随后的 user 消息 content part 注入，交由视觉管道处理。
    const { text: toolText, dataUrls } = consumeToolImageMarkers(result);

    // P2.3: 同轮扩展 — 工具结果可携带 [addedToolNames: a,b,c] 协议行
    for (const name of extractAddedToolNames(toolText)) {
      this.runState.addedToolNamesThisTurn.add(name);
    }

    // P1.6: 大工具结果归档 — 超过阈值写盘并保留短摘要 + ref（可 read_artifact 水合）
    let archivedText = toolText;
    let artifactRef: string | undefined;
    if (this.dataDir && options?.sessionId) {
      const archived = archiveToolResult({
        dataDir: this.dataDir,
        sessionId: options.sessionId,
        toolCallId: call.id,
        text: toolText,
      });
      archivedText = archived.text;
      artifactRef = archived.artifactRef;
    }

    const durationMs = Date.now() - startTime;
    if (toolEndHandler) {
      toolEndHandler(call.name, archivedText, durationMs, approved, call.id, artifactRef);
    }

    messages.push({
      id: generateId("msg_"),
      role: "tool",
      content: archivedText,
      tool_call_id: call.id,
      name: call.name,
      timestamp: Date.now(),
    });

    if (dataUrls.length > 0) {
      messages.push({
        id: generateId("msg_"),
        role: "user",
        content: [
          { type: "text", text: "（工具截图）" },
          ...dataUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ],
        timestamp: Date.now(),
      });
    }
  }

  getMemory(): MemoryManager {
    return this.memory;
  }
}
