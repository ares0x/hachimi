// packages/core/src/memory/memdir.ts
//
// P2.5: memdir — 长期记忆的人可读目录形态（grok/Claude Code memdir 模式）。
//
// 结构：
//   {dataDir}/memdir/MEMORY.md         索引（约 200 行 / 25KB 封顶，人可读可编辑）
//   {dataDir}/memdir/memories/{id}.md  每条长期记忆一个文件
//
// 设计：
//   - 索引含 HTML 注释元数据（id/importance/date/source），与 exportMarkdown 同构
//   - sideQuery：无嵌入的轻量关键词评分，返回 ≤5 条（供快速检索/展示）
//   - 只读损坏容错：MEMORY.md 被用户手改后仍可解析；缺文件不报错
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "@hachimi/shared";
import type { MemoryEntry } from "../types/index.js";

export const MEMDIR_MAX_INDEX_LINES = 200;
export const MEMDIR_MAX_INDEX_BYTES = 25_000;

export interface MemdirIndexEntry {
  id: string;
  content: string;
  importance: number;
  createdAt: number;
  source?: string;
}

export class MemdirStore {
  private readonly root: string;
  private readonly indexFile: string;
  private readonly memoriesDir: string;

  constructor(dataDir: string) {
    this.root = join(dataDir, "memdir");
    this.indexFile = join(this.root, "MEMORY.md");
    this.memoriesDir = join(this.root, "memories");
    mkdirSync(this.memoriesDir, { recursive: true });
  }

  /**
   * 将长期记忆同步到 memdir：每条一个文件 + 重建索引（封顶行数/字节）。
   * 幂等：按 id 覆盖写入。
   */
  syncFromEntries(entries: MemoryEntry[]): { written: number; indexLines: number } {
    let written = 0;
    for (const e of entries) {
      if (e.layer !== "long_term") continue;
      const file = join(this.memoriesDir, `${e.id}.md`);
      try {
        writeFileSync(file, e.content, "utf-8");
        written++;
      } catch (err) {
        log("warn", `[Memdir] 写入记忆文件失败 ${e.id}:`, err);
      }
    }

    const lines: string[] = ["# Hachimi Memory (memdir)", ""];
    for (const e of entries) {
      if (e.layer !== "long_term") continue;
      const date = new Date(e.createdAt).toISOString().slice(0, 10);
      lines.push(
        `<!-- id=${e.id} layer=${e.layer} importance=${e.importance.toFixed(2)} date=${date} source=${e.source ?? "-"} -->`
      );
      lines.push(`- ${e.content}`);
      lines.push("");
      if (lines.length >= MEMDIR_MAX_INDEX_LINES - 4) break;
    }

    // 字节封顶：超限时截断索引文件（记忆文件本体不受影响）
    let body = lines.join("\n");
    if (Buffer.byteLength(body, "utf-8") > MEMDIR_MAX_INDEX_BYTES) {
      body = `${body.slice(0, MEMDIR_MAX_INDEX_BYTES)}\n…[索引已截断]`;
    }
    try {
      writeFileSync(this.indexFile, body, "utf-8");
    } catch (err) {
      log("warn", "[Memdir] 写索引失败:", err);
    }
    return { written, indexLines: lines.length };
  }

  /** 解析索引中的条目（容错：损坏行跳过） */
  loadIndex(): MemdirIndexEntry[] {
    if (!existsSync(this.indexFile)) return [];
    const out: MemdirIndexEntry[] = [];
    let pending: { id: string; importance: number; date: string; source?: string } | undefined;
    for (const line of readFileSync(this.indexFile, "utf-8").split("\n")) {
      const meta = line.match(
        /<!-- id=(\S+) .*?importance=([\d.]+) date=(\S+)( source=(\S+))? -->/
      );
      if (meta) {
        pending = {
          id: meta[1],
          importance: Number(meta[2]),
          date: meta[3],
          source: meta[5],
        };
        continue;
      }
      const item = line.match(/^- (.+)$/);
      if (item && pending) {
        out.push({
          id: pending.id,
          content: item[1],
          importance: pending.importance,
          createdAt: new Date(pending.date).getTime() || Date.now(),
          source: pending.source,
        });
        pending = undefined;
      }
    }
    return out;
  }

  /** 单条记忆正文（索引缺失时兜底） */
  readMemory(id: string): string | undefined {
    const file = join(this.memoriesDir, `${id}.md`);
    if (!existsSync(file)) return undefined;
    return readFileSync(file, "utf-8");
  }

  /**
   * sideQuery：无嵌入的轻量关键词评分（内容+来源加权），返回 ≤limit（默认 5）条。
   * 作为嵌入检索的廉价补充路径（Grok sideQuery 模式）。
   */
  sideQuery(query: string, limit = 5): MemdirIndexEntry[] {
    const q = query.toLowerCase();
    const terms = q.split(/\s+/).filter((t) => t.length > 1);
    if (terms.length === 0) return [];
    const scored = this.loadIndex()
      .map((e) => {
        const text = `${e.content} ${e.source ?? ""}`.toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (text.includes(t)) score += 1;
        }
        if (e.content.toLowerCase().includes(q)) score += 2; // 整句命中加权
        return { e, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.e.importance - a.e.importance);
    return scored.slice(0, limit).map((x) => x.e);
  }

  /** memdir 中已存在的记忆文件数（诊断用） */
  countFiles(): number {
    if (!existsSync(this.memoriesDir)) return 0;
    return readdirSync(this.memoriesDir).filter((f) => f.endsWith(".md")).length;
  }
}
