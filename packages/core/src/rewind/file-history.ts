// packages/core/src/rewind/file-history.ts
//
// P2.6: Rewind / checkpoint — 文件历史快照（event-first）
//
// 设计（参考 Claude Code fileHistory / grok 三域 rewind）：
// - 内容落盘 {dataDir}/rewind/{sessionId}/{eventId}.md，事件流只保存元数据 + ref，
//   与 P1.6 artifact 归档同一思路（事件流不膨胀、可移植）。
// - capture() 去重：同一文件同 sha 的 before 快照不重复写入。
// - 磁盘内容保留上限 FILE_HISTORY_MAX_SNAPSHOTS（默认 100）：超出后淘汰最旧
//   内容文件（事件保留，append-only 语义不被破坏，readContent 返回 null 表示已淘汰）。
// - rebuildSnapshotChain() 是纯函数：从事件流重建每个文件的有序快照链，
//   UI / API / 测试可在不读盘的情况下直接消费。

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { generateId, log } from "@hachimi/shared";
import type { IEventStore } from "../events/event-store.js";
import type { FileHistorySnapshotEvent, RuntimeEvent } from "../types/event.js";

/** 每个 session 保留的快照内容文件上限（事件本身不受限） */
export const FILE_HISTORY_MAX_SNAPSHOTS = 100;

/** 快照模式：编辑前 / 编辑后 / 手动 checkpoint */
export type SnapshotMode = "before" | "after" | "manual";

export interface FileSnapshotInput {
  sessionId: string;
  /** 工作区相对路径（与工具参数保持一致，保证可移植性） */
  filePath: string;
  content: string;
  mode: SnapshotMode;
  /** 触发快照的工具名（自动捕获时必填） */
  toolName?: string;
  messageId?: string;
}

/**
 * 写工具用非阻断辅助：在执行变更前捕获 before 快照。
 * 任何失败都吞掉（快照是附属能力，不能阻断文件编辑）。
 */
export async function captureBeforeFileHistory(
  fileHistory: FileHistoryStore | undefined,
  opts: {
    sessionId?: string;
    filePath: string;
    content: string;
    toolName: string;
  }
): Promise<void> {
  if (!fileHistory || !opts.sessionId) return;
  try {
    await fileHistory.capture({
      sessionId: opts.sessionId,
      filePath: opts.filePath,
      content: opts.content,
      mode: "before",
      toolName: opts.toolName,
    });
  } catch {
    /* non-blocking */
  }
}

/** 事件流中一条快照记录（重建链的输出元素） */
export interface SnapshotRecord {
  eventId: string;
  timestamp: string;
  sessionId: string;
  filePath: string;
  mode: SnapshotMode;
  ref: string;
  sha: string;
  size: number;
  toolName?: string;
  messageId?: string;
}

/** 重建出的文件快照链（oldest → newest） */
export interface SnapshotChain {
  files: Array<{
    filePath: string;
    snapshots: SnapshotRecord[];
  }>;
}

/** 纯函数：从事件流重建每个文件的有序快照链（不读盘，供 UI/API/测试消费） */
export function rebuildSnapshotChain(events: RuntimeEvent[]): SnapshotChain {
  const byFile = new Map<string, SnapshotRecord[]>();
  for (const ev of events) {
    if (ev.type !== "file_history_snapshot") continue;
    const p = ev.payload.filePath;
    const list = byFile.get(p) ?? [];
    list.push({
      eventId: ev.id,
      timestamp: ev.timestamp,
      sessionId: ev.sessionId,
      filePath: p,
      mode: ev.payload.mode,
      ref: ev.payload.ref,
      sha: ev.payload.sha,
      size: ev.payload.size,
      toolName: ev.payload.toolName,
      messageId: ev.payload.messageId,
    });
    byFile.set(p, list);
  }
  const files = [...byFile.entries()]
    .map(([filePath, snapshots]) => ({ filePath, snapshots }))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
  return { files };
}

/**
 * 文件历史快照存储：负责内容落盘、事件追加、去重与容量上限。
 * 由 HarnessRuntime 持有，经 ToolExecContext.fileHistory 注入写工具与 meta 工具。
 */
export class FileHistoryStore {
  private readonly dataDir: string;
  private readonly events: IEventStore;

  constructor(dataDir: string, events: IEventStore) {
    this.dataDir = dataDir;
    this.events = events;
  }

  private sessionDir(sessionId: string): string {
    return join(resolve(this.dataDir), "rewind", sessionId);
  }

  /**
   * 写入一条快照：去重（同文件同 sha 的 before 快照跳过）→ 落盘 → 追加事件 → 容量裁剪。
   * 任何失败都不抛出（快照失败不应阻断文件编辑）。
   */
  async capture(input: FileSnapshotInput): Promise<FileHistorySnapshotEvent | null> {
    const { sessionId, filePath, content, mode } = input;
    const sha = createHash("sha256").update(content, "utf-8").digest("hex");
    const size = Buffer.byteLength(content, "utf-8");

    if (await this.isDuplicate(sessionId, filePath, mode, sha)) {
      return null;
    }

    const eventId = generateId("evt_");
    const ref = `${sessionId}/${eventId}`;
    try {
      const dir = this.sessionDir(sessionId);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${eventId}.md`), content, "utf-8");
    } catch (err) {
      log("warn", `[FileHistory] Failed to write snapshot ${ref}:`, err);
      return null;
    }

    const event: FileHistorySnapshotEvent = {
      id: eventId,
      sessionId,
      timestamp: new Date().toISOString(),
      type: "file_history_snapshot",
      payload: {
        filePath,
        mode,
        ref,
        sha,
        size,
        ...(input.toolName ? { toolName: input.toolName } : {}),
        ...(input.messageId ? { messageId: input.messageId } : {}),
      },
    };
    try {
      await this.events.append(event);
    } catch (err) {
      log("warn", `[FileHistory] Failed to append snapshot event ${ref}:`, err);
      return null;
    }

    this.enforceCap(sessionId);
    return event;
  }

  /** 列出某 session 的文件快照链（读事件流 + 纯函数重建；支持按路径过滤） */
  async listChain(sessionId: string, filePath?: string): Promise<SnapshotChain> {
    const events: RuntimeEvent[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.events.list(sessionId, {
        types: ["file_history_snapshot"],
        cursor,
        limit: 500,
      });
      events.push(...page.events);
      cursor = page.nextCursor;
    } while (cursor);

    const chain = rebuildSnapshotChain(events);
    if (filePath) {
      return {
        files: chain.files.filter((f) => f.filePath === filePath),
      };
    }
    return chain;
  }

  /**
   * 读取快照内容。ref 必须形如 `{sessionId}/{eventId}`；路径穿越防御：
   * 解析后必须仍位于 rewind 根目录内。内容被容量上限淘汰时返回 null。
   */
  readContent(ref: string): string | null {
    const filePath = this.resolveRef(ref);
    if (!filePath) {
      throw new Error(`[file_history] 非法引用（路径越界）: ${ref}`);
    }
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  }

  /** 快照内容是否仍保留在磁盘（未被容量上限淘汰） */
  hasContent(ref: string): boolean {
    const filePath = this.resolveRef(ref);
    return filePath ? existsSync(filePath) : false;
  }

  /** 清空某 session 的全部快照（删除 session 时调用） */
  async clearSession(sessionId: string): Promise<void> {
    const dir = this.sessionDir(sessionId);
    if (!existsSync(dir)) return;
    try {
      for (const f of readdirSync(dir)) unlinkSync(join(dir, f));
      unlinkSync(dir);
    } catch (err) {
      log("warn", `[FileHistory] Failed to clear session ${sessionId}:`, err);
    }
  }

  // ─── 私有工具 ───────────────────────────────────────────────────────────────

  /** 去重：同文件同模式最近一条快照 sha 相同则跳过（避免噪音事件） */
  private async isDuplicate(
    sessionId: string,
    filePath: string,
    mode: SnapshotMode,
    sha: string
  ): Promise<boolean> {
    const recent = await this.events.tail(sessionId, 200);
    for (let i = recent.length - 1; i >= 0; i--) {
      const ev = recent[i];
      if (ev.type !== "file_history_snapshot") continue;
      if (ev.payload.filePath !== filePath) continue;
      // 只与同模式的最近快照比较（manual 与 before 语义不同，不互相去重）
      if (ev.payload.mode !== mode) continue;
      return ev.payload.sha === sha;
    }
    return false;
  }

  /** 容量裁剪：磁盘内容文件超过上限时删除最旧的（事件保留） */
  private enforceCap(sessionId: string): void {
    const dir = this.sessionDir(sessionId);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    } catch {
      return;
    }
    if (files.length <= FILE_HISTORY_MAX_SNAPSHOTS) return;

    const byMtime = files
      .map((f) => {
        try {
          const { mtimeMs } = statSync(join(dir, f));
          return { f, mtimeMs };
        } catch {
          return { f, mtimeMs: 0 };
        }
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    const excess = byMtime.length - FILE_HISTORY_MAX_SNAPSHOTS;
    for (let i = 0; i < excess && i < byMtime.length; i++) {
      try {
        unlinkSync(join(dir, byMtime[i].f));
      } catch {
        /* best effort */
      }
    }
  }

  /** 将 ref（`{sessionId}/{eventId}`）解析为 rewind 根下的绝对路径 */
  private resolveRef(ref: string): string | null {
    const clean = String(ref).replace(/\\/g, "/").replace(/^\/+/, "");
    const segments = clean.split("/").filter(Boolean);
    if (segments.length !== 2 || segments.some((s) => s === ".." || s === "." || s.includes(":"))) {
      return null;
    }
    return `${join(resolve(this.dataDir), "rewind", ...segments)}.md`;
  }
}
