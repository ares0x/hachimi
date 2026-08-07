import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { generateId, SUB_AGENT_SESSION_PREFIX } from "@hachimi/shared";
import type { JsonDirStore } from "@hachimi/storage";
import { FileDirStore } from "@hachimi/storage";
import type { Message, Session } from "../types/index.js";

export class SessionManager {
  private dir: string;
  private store: JsonDirStore;
  private current: Session | null = null;

  constructor(dir = "data/sessions", store: JsonDirStore = new FileDirStore()) {
    this.dir = dir;
    this.store = store;
    this.store.ensureDir(dir);
  }

  private fileOf(id: string) {
    return join(this.dir, `${id}.json`);
  }

  /** 创建新会话 */
  create(title?: string, customId?: string): Session {
    const session: Session = {
      id: customId || generateId("sess_"),
      title: title || `新对话 ${new Date().toLocaleTimeString()}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.save(session);
    this.current = session;
    return session;
  }

  /** 获取指定会话 */
  load(id: string): Session | null {
    const s = this.store.read<Session>(this.fileOf(id));
    if (s && (!this.current || this.current.id === id)) {
      this.current = s;
    }
    return s;
  }

  /** 获取或创建当前会话 */
  getOrCreate(sessionId?: string): Session {
    if (sessionId) {
      const existing = this.load(sessionId);
      if (existing) return existing;
      return this.create(undefined, sessionId);
    }
    if (this.current) return this.current;
    return this.create();
  }

  /** 保存会话 */
  save(session?: Session) {
    const target = session || this.current;
    if (!target) return;
    target.updatedAt = Date.now();
    this.store.write(this.fileOf(target.id), target);
  }

  list() {
    return (
      this.store
        .list(this.dir)
        .map((name) => this.store.read<Session>(join(this.dir, name)))
        .filter((s): s is Session => !!s)
        // P1: 过滤子代理内部会话（sub_sess_*），避免污染用户会话列表/侧边栏
        .filter((s) => !s.id.startsWith(SUB_AGENT_SESSION_PREFIX))
        .map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );
  }

  /** 重命名指定会话 */
  rename(id: string, title: string): Session | null {
    const session = this.load(id);
    if (!session) return null;
    session.title = title;
    this.save(session);
    return session;
  }

  /** P0-2: 读取会话执行模式（normal | plan），默认 normal */
  getMode(sessionId: string): "normal" | "plan" {
    const session = this.load(sessionId);
    const mode = session?.metadata?.mode;
    return mode === "plan" ? "plan" : "normal";
  }

  /** P0-2: 设置会话执行模式并持久化 */
  setMode(sessionId: string, mode: "normal" | "plan"): boolean {
    const session = this.load(sessionId);
    if (!session) return false;
    session.metadata = { ...(session.metadata ?? {}), mode };
    this.save(session);
    return true;
  }

  /** 删除指定会话 */
  delete(id: string): boolean {
    const filePath = this.fileOf(id);
    this.store.remove(filePath);
    if (this.current?.id === id) {
      this.current = null;
    }
    return true;
  }

  /** 追加消息并保存 */
  appendMessage(message: Message) {
    const session = this.getOrCreate();
    session.messages.push(message);
    this.save(session);
  }

  /** 获取当前会话的消息历史 */
  getHistory(): Message[] {
    return this.current?.messages ?? [];
  }

  getCurrent(): Session | null {
    return this.current;
  }

  /**
   * Auto-compact long session message history (Claude Code pattern).
   * Preserves initial user goal + recent N messages, replacing old middle messages
   * with an optional LLM-generated semantic summary or an archive note.
   */
  async autoCompact(
    sessionId?: string,
    maxMessages = 30,
    keepRecent = 16,
    summarizer?: (messagesToPrune: Message[]) => Promise<string>
  ): Promise<boolean> {
    const session = sessionId ? this.load(sessionId) : this.getCurrent();
    if (!session || session.messages.length <= maxMessages) return false;

    const firstMsg = session.messages[0];
    const totalCount = session.messages.length;
    const recent = session.messages.slice(-keepRecent);
    const pruned = session.messages.slice(1, totalCount - keepRecent);
    const prunedCount = pruned.length;

    if (prunedCount <= 0) return false;

    let summaryText = `[早期对话历史已归档: 已自动压缩 ${prunedCount} 条历史消息，保留首条初始目标与最新 ${keepRecent} 轮对话]`;

    if (summarizer) {
      try {
        const customSummary = await summarizer(pruned);
        if (customSummary?.trim()) {
          summaryText = `【历史对话语义总结 (${prunedCount} 条历史已归档)】:\n${customSummary.trim()}`;
        }
      } catch {
        /* fallback to static note */
      }
    }

    const archiveNote: Message = {
      id: generateId("msg_compact_"),
      role: "system",
      content: summaryText,
      timestamp: Date.now(),
    };

    session.messages = [firstMsg, archiveNote, ...recent];
    this.save(session);
    return true;
  }

  summarize() {
    this.autoCompact(undefined, 30, 16);
  }
}
