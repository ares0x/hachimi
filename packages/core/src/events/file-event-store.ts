/**
 * W0.2: FileEventStore — 基于 JSONL 文件的 Append-only 事件存储
 *
 * 每个 Session 单独一个 JSONL 文件：
 *   {dataDir}/events/{sessionId}.jsonl
 *
 * 格式：每行一个 JSON 对象（RuntimeEvent），追加写入，不覆盖。
 * 读取时按行解析，过滤掉空行或解析失败的行（降级处理）。
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { log } from "@hachimi/shared";
import type { RuntimeEvent, RuntimeEventType } from "../types/event.js";
import type { EventListOptions, EventListResult, IEventStore } from "./event-store.js";

export class FileEventStore implements IEventStore {
  private readonly dir: string;
  /**
   * Per-session append counter. seq is write-only metadata (monotonically
   * increasing per session) — caching it avoids re-reading and re-parsing the
   * whole JSONL file on every append (which was O(n) per append, O(n²) per run).
   */
  private seqCache = new Map<string, number>();

  constructor(dataDir: string) {
    this.dir = join(dataDir, "events");
    this.ensureDir();
  }

  // ─── 私有工具 ───────────────────────────────────────────────────────────────

  private ensureDir(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private filePath(sessionId: string): string {
    return join(this.dir, `${sessionId}.jsonl`);
  }

  /**
   * 读取指定 session 的所有事件（原始解析，供内部使用）
   */
  private readAll(sessionId: string): RuntimeEvent[] {
    const path = this.filePath(sessionId);
    if (!existsSync(path)) return [];

    const raw = readFileSync(path, "utf-8");
    const events: RuntimeEvent[] = [];

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as RuntimeEvent);
      } catch {
        // 跳过损坏行（降级处理，不中断读取）
        log("warn", `[FileEventStore] Skipped corrupt event line in ${sessionId}.jsonl`);
      }
    }

    return events;
  }

  // ─── IEventStore 实现 ───────────────────────────────────────────────────────

  async append(event: RuntimeEvent): Promise<void> {
    let seq = event.seq;
    if (seq === undefined) {
      const cached = this.seqCache.get(event.sessionId);
      if (cached !== undefined) {
        seq = cached + 1;
      } else {
        // Cache miss (process restart or first append): scan once, then cache.
        seq = this.readAll(event.sessionId).length + 1;
      }
      this.seqCache.set(event.sessionId, seq);
    }
    const eventWithSeq = { ...event, seq };
    const path = this.filePath(event.sessionId);
    const line = `${JSON.stringify(eventWithSeq)}\n`;
    try {
      appendFileSync(path, line, "utf-8");
    } catch (err) {
      log("error", `[FileEventStore] Failed to append event to ${event.sessionId}.jsonl:`, err);
      throw err;
    }
  }

  async list(sessionId: string, options: EventListOptions = {}): Promise<EventListResult> {
    const { cursor, limit = 50, types } = options;

    let all = this.readAll(sessionId);

    // 按 type 过滤
    if (types && types.length > 0) {
      const typeSet = new Set<RuntimeEventType>(types);
      all = all.filter((e) => typeSet.has(e.type));
    }

    const total = all.length;

    // cursor 分页：从 cursor 事件 ID 之后开始
    let startIndex = 0;
    if (cursor) {
      const idx = all.findIndex((e) => e.id === cursor);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const page = all.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < all.length ? page[page.length - 1]?.id : undefined;

    return { events: page, nextCursor, total };
  }

  async tail(sessionId: string, n = 20): Promise<RuntimeEvent[]> {
    const all = this.readAll(sessionId);
    return all.slice(-n);
  }

  async hasEvents(sessionId: string): Promise<boolean> {
    return existsSync(this.filePath(sessionId));
  }

  async listSessionIds(): Promise<string[]> {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.replace(/\.jsonl$/, ""));
  }

  async delete(sessionId: string): Promise<void> {
    this.seqCache.delete(sessionId);
    const path = this.filePath(sessionId);
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch (err) {
        log("warn", `[FileEventStore] Failed to delete event log ${sessionId}.jsonl:`, err);
      }
    }
  }
}
