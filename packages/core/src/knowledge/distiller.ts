// packages/core/src/knowledge/distiller.ts

/**
 * KnowledgeDistiller — 记忆→知识提纯闭环
 *
 * 长程会话自然「结束」（空闲 idleHours 小时以上）后，在后台把对话提炼成
 * 结构化 Markdown 草稿，写入个人知识库的 _inbox 收件箱，供用户审阅归档。
 *
 * 设计约束：
 * - 只处理空闲会话，绝不触碰活跃对话；
 * - 频率门控（minScanIntervalMs）+ 单次上限（maxDraftsPerScan）+ 去重状态，
 *   避免重复生成与成本失控；
 * - 完全异步、非阻塞（调用方 fire-and-forget），失败静默跳过。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { HachimiConfig } from "@hachimi/config";
import { resolveLlmSelection } from "@hachimi/config";
import { generateId, log, SUB_AGENT_SESSION_PREFIX } from "@hachimi/shared";
import { createLLMForConnection } from "../agent/llm-factory.js";
import type { AppContext } from "../runtime/context.js";
import type { LLMProvider, Message } from "../types/index.js";

export interface KnowledgeDistillationConfig {
  /** 总开关（默认 true） */
  enabled?: boolean;
  /** 至少多少轮用户消息才值得提纯（默认 6） */
  minUserTurns?: number;
  /** 会话空闲多少小时后视为「已结束」（默认 2） */
  idleHours?: number;
  /** 两次扫描的最小间隔（默认 30 分钟，毫秒） */
  minScanIntervalMs?: number;
  /** 单次扫描最多生成几份草稿（默认 2） */
  maxDraftsPerScan?: number;
  /** 参与提纯的最近消息数上限（默认 40） */
  maxContextMessages?: number;
  /** 覆盖 knowledgeWriteRoot 的收件箱根（测试/自定义） */
  inboxDir?: string;
}

export const DEFAULT_DISTILLATION: Required<Omit<KnowledgeDistillationConfig, "inboxDir">> = {
  enabled: true,
  minUserTurns: 6,
  idleHours: 2,
  minScanIntervalMs: 30 * 60 * 1000,
  maxDraftsPerScan: 2,
  maxContextMessages: 40,
};

/** 提纯提示词：产出可直接归档的结构化 Markdown 草稿 */
export const DISTILL_PROMPT = `你是 Hachimi 的知识提纯引擎。请把一段长会话记录提炼成一份「可归档的知识草稿」，供用户后续整理进个人知识库。
要求：
- 直接输出完整的 Markdown 文档本体，不要解释过程。
- 结构如下：
  # <主题标题>
  ## 摘要
  3-5 句话概括这次会话做了什么、产出是什么。
  ## 关键决策
  - 列表；无则写「无」
  ## 洞察与结论
  - 列表；无则写「无」
  ## 后续行动
  - 列表；无则写「无」
  ## 相关文件/工具
  - 会话中提到过的文件、工具、服务；无则写「无」
- 只收录对用户长期有价值的信息；删除寒暄、重复、低价值细节。
- 如果会话本身没有值得沉淀的内容，只输出一行：<!-- 无可沉淀内容 -->
- 使用中文。`;

interface DistillationState {
  [sessionId: string]: { distilledAt: string; draftFile?: string };
}

export interface KnowledgeDistillerResult {
  /** 本次扫描成功生成草稿的会话 ID 列表 */
  distilled: string[];
}

export class KnowledgeDistiller {
  private readonly context: AppContext;
  private readonly cfg: Required<Omit<KnowledgeDistillationConfig, "inboxDir">> & {
    inboxDir?: string;
  };
  private readonly getProvider: (connectionId: string, modelId?: string) => LLMProvider | null;
  private lastScanAt = 0;
  private scanning = false;

  constructor(
    context: AppContext,
    options: KnowledgeDistillationConfig = {},
    getProvider?: (connectionId: string, modelId?: string) => LLMProvider | null
  ) {
    this.context = context;
    this.cfg = {
      ...DEFAULT_DISTILLATION,
      ...(context.config.knowledge?.distillation ?? {}),
      ...options,
    };
    this.getProvider =
      getProvider ??
      ((connectionId, modelId) =>
        createLLMForConnection(this.context.config, connectionId, modelId));
  }

  /** 低频后台扫描：仅处理「空闲足够久」的会话，不触碰活跃对话 */
  async maybeDistillIdleSessions(): Promise<KnowledgeDistillerResult> {
    if (!this.cfg.enabled) return { distilled: [] };
    const now = Date.now();
    if (now - this.lastScanAt < this.cfg.minScanIntervalMs) return { distilled: [] };
    if (this.scanning) return { distilled: [] };
    this.lastScanAt = now;
    this.scanning = true;
    try {
      return await this.scan();
    } finally {
      this.scanning = false;
    }
  }

  private async scan(): Promise<KnowledgeDistillerResult> {
    const idleBefore = Date.now() - this.cfg.idleHours * 3_600_000;
    const state = this.loadState();
    const candidates = this.context.sessions
      .list()
      .filter((s) => !s.id.startsWith(SUB_AGENT_SESSION_PREFIX))
      .filter((s) => (s.updatedAt ?? 0) < idleBefore)
      .filter((s) => !state[s.id])
      .slice(0, 20);

    const distilled: string[] = [];
    for (const s of candidates) {
      if (distilled.length >= this.cfg.maxDraftsPerScan) break;
      if (await this.distillSession(s.id, state)) {
        distilled.push(s.id);
      }
    }
    this.saveState(state);
    return { distilled };
  }

  private async distillSession(sessionId: string, state: DistillationState): Promise<boolean> {
    const session = this.context.sessions.load(sessionId);
    if (!session) return false;
    const userTurns = session.messages.filter((m) => m.role === "user").length;
    if (userTurns < this.cfg.minUserTurns) return false;

    const messages = session.messages.slice(-this.cfg.maxContextMessages);
    const draft = await this.generateDraft(session.title || sessionId, messages);
    if (!draft) return false;

    const inboxRoot =
      this.cfg.inboxDir ||
      this.context.config.personalContext?.knowledgeWriteRoot ||
      join(this.context.config.paths.dataDir, "knowledge-drafts");
    const inboxDir = join(inboxRoot, "_inbox");
    mkdirSync(inboxDir, { recursive: true });

    const ts = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    const slug = sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(-10) || "session";
    const file = join(inboxDir, `draft_${stamp}_${slug}.md`);
    writeFileSync(file, draft, "utf-8");

    state[sessionId] = { distilledAt: new Date().toISOString(), draftFile: file };
    try {
      await this.context.events.append({
        id: generateId("evt_"),
        sessionId,
        correlationId: `distill_${sessionId}`,
        type: "checkpoint",
        timestamp: new Date().toISOString(),
        payload: {
          kind: "knowledge",
          draftFile: file,
          label: `知识草稿已生成: ${basename(file)}`,
        },
      });
    } catch {
      /* 审计事件失败不阻断提纯 */
    }
    log("info", `[KnowledgeDistiller] 已生成知识草稿: ${file}`);
    return true;
  }

  private async generateDraft(title: string, messages: Message[]): Promise<string | null> {
    const sel = resolveLlmSelection(this.context.config);
    const provider = this.getProvider(sel.connectionId, sel.modelId);
    if (!provider) return null;

    const transcript = messages
      .map((m) => {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
        return `### ${m.role}\n${content}`;
      })
      .join("\n\n")
      .slice(0, 24_000);

    try {
      const res = await provider.chat(
        [
          {
            id: "sys_distill",
            role: "system",
            content: DISTILL_PROMPT,
            timestamp: Date.now(),
          },
          {
            id: "user_distill",
            role: "user",
            content: `会话主题: ${title}\n\n以下是会话记录:\n\n${transcript}`,
            timestamp: Date.now(),
          },
        ],
        undefined,
        { timeoutMs: 120_000 }
      );
      const text = res?.content?.trim() ?? "";
      return text.length > 50 ? text : null;
    } catch (err) {
      log("warn", "[KnowledgeDistiller] LLM 调用失败，跳过本次提纯", {
        error: String(err),
      });
      return null;
    }
  }

  private stateFile(): string {
    return join(this.context.config.paths.dataDir, "knowledge", "distillation-state.json");
  }

  private loadState(): DistillationState {
    try {
      if (existsSync(this.stateFile())) {
        return JSON.parse(readFileSync(this.stateFile(), "utf-8")) as DistillationState;
      }
    } catch {
      /* 损坏状态视为空 */
    }
    return {};
  }

  private saveState(state: DistillationState): void {
    try {
      mkdirSync(dirname(this.stateFile()), { recursive: true });
      writeFileSync(this.stateFile(), JSON.stringify(state, null, 2), "utf-8");
    } catch (err) {
      log("warn", "[KnowledgeDistiller] 状态写入失败", { error: String(err) });
    }
  }
}

/** 合并配置：显式 options > config.knowledge.distillation > 默认值（供外部读取展示） */
export function resolveDistillationConfig(
  config: HachimiConfig,
  options: KnowledgeDistillationConfig = {}
): Required<Omit<KnowledgeDistillationConfig, "inboxDir">> & { inboxDir?: string } {
  return {
    ...DEFAULT_DISTILLATION,
    ...(config.knowledge?.distillation ?? {}),
    ...options,
  };
}
