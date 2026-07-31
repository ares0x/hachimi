import { createHash } from "node:crypto";
import {
  cosineSimilarity,
  generateId,
  jaccardSimilarity,
  normalizeText,
  searchSemanticRank,
} from "@hachimi/shared";
import type { JsonFileStore } from "@hachimi/storage";
import { FileJsonStore } from "@hachimi/storage";
import type { MemoryEntry, MemoryLayer } from "../types/index.js";
import type { MemorySearchOptions } from "./types.js";

interface MemoryData {
  working: MemoryEntry[];
  session: MemoryEntry[];
  longTerm: MemoryEntry[];
  archival: MemoryEntry[];
}

export interface ExtendedMemorySearchOptions extends MemorySearchOptions {
  queryEmbedding?: number[];
}

export class MemoryManager {
  private filePath: string;
  private store: JsonFileStore;
  private working: MemoryEntry[] = [];
  private session: MemoryEntry[] = [];
  private longTerm: MemoryEntry[] = [];
  private archival: MemoryEntry[] = [];

  constructor(filePath = "data/memory.json", store: JsonFileStore = new FileJsonStore()) {
    this.filePath = filePath;
    this.store = store;
    this.load();
  }

  /** 从文件加载记忆 */
  load() {
    const data = this.store.read<MemoryData>(this.filePath, {
      working: [],
      session: [],
      longTerm: [],
      archival: [],
    });
    this.working = data.working ?? [];
    this.session = data.session ?? [];
    this.longTerm = data.longTerm ?? [];
    this.archival = data.archival ?? [];
  }

  /** 保存记忆到文件 */
  save() {
    this.store.write(this.filePath, {
      working: this.working,
      session: this.session,
      longTerm: this.longTerm,
      archival: this.archival,
    });
  }

  /**
   * 添加一条记忆
   */
  /**
   * P1: Content-addressed ID (Maka pattern). Same content → same ID → natural dedup.
   * Fallback to random ID for backwards compat with existing entries.
   */
  private contentId(content: string): string {
    return `mem_${createHash("sha256").update(content.trim()).digest("hex").slice(0, 16)}`;
  }

  add(params: {
    layer: MemoryLayer;
    content: string;
    importance?: number;
    embedding?: number[];
    /** P3: Source of this memory */
    source?: "user" | "agent";
  }): MemoryEntry {
    const trimmed = params.content.trim();
    const cid = this.contentId(trimmed);

    // P1: Content-addressed dedup — replace existing entry with same content
    const layerArr = this.getLayerArray(params.layer);
    const existingIdx = layerArr.findIndex((e) => e.id === cid);
    if (existingIdx >= 0) {
      layerArr[existingIdx] = {
        ...layerArr[existingIdx],
        importance: Math.max(layerArr[existingIdx].importance, params.importance ?? 0.5),
        lastAccessedAt: Date.now(),
      };
      this.save();
      return layerArr[existingIdx];
    }

    const entry: MemoryEntry = {
      id: cid,
      layer: params.layer,
      content: trimmed,
      importance: params.importance ?? 0.5,
      embedding: params.embedding,
      source: params.source,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    layerArr.push(entry);
    this.cleanup();
    return entry;
  }

  /**
   * B3 记忆检索 v2：混合语义相似度与重要度评分
   */
  search(query: string, options: ExtendedMemorySearchOptions = {}): MemoryEntry[] {
    const {
      layers = ["working", "session", "long_term"],
      limit = 8,
      minImportance = 0,
      queryEmbedding,
    } = options;
    const candidates: MemoryEntry[] = [];

    for (const layer of layers) {
      candidates.push(...this.getLayerArray(layer));
    }

    // 过滤基础重要性
    const filtered = candidates.filter((e) => e.importance >= minImportance);

    // 计算综合得分：相似度 60% + 重要度 40%
    const scored = filtered.map((entry) => {
      let simScore = 0;
      if (queryEmbedding && entry.embedding) {
        simScore = Math.max(0, cosineSimilarity(queryEmbedding, entry.embedding));
      } else {
        simScore = jaccardSimilarity(query, entry.content);
      }

      // 如果内容直接包含检索词，赋予基准奖励
      if (query && entry.content.toLowerCase().includes(query.toLowerCase())) {
        simScore = Math.max(simScore, 0.85);
      }

      const totalScore = simScore * 0.6 + entry.importance * 0.4;
      return { entry, score: totalScore };
    });

    // 按综合得分降序排列
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit).map((s) => s.entry);

    // 更新访问时间
    const now = Date.now();
    return results.map((e) => {
      e.lastAccessedAt = now;
      return e;
    });
  }

  /**
   * H4.1: 基于向量余弦相似度的语义记忆检索
   */
  searchSemanticMemories(
    query: string,
    optionsOrTopK: number | { topK?: number; minScore?: number; layers?: MemoryLayer[] } = 5,
    minScoreArg = 0.25
  ): MemoryEntry[] {
    const topK = typeof optionsOrTopK === "number" ? optionsOrTopK : (optionsOrTopK.topK ?? 5);
    const minScore =
      typeof optionsOrTopK === "number" ? minScoreArg : (optionsOrTopK.minScore ?? 0.25);
    const layers =
      typeof optionsOrTopK === "number"
        ? ["working", "session", "long_term"]
        : (optionsOrTopK.layers ?? ["working", "session", "long_term"]);

    const candidates: MemoryEntry[] = [];
    for (const layer of layers as MemoryLayer[]) {
      candidates.push(...this.getLayerArray(layer));
    }
    return searchSemanticRank(candidates, query, (entry) => entry.content, topK, minScore);
  }

  // 获取某层所有记忆
  getLayer(layer: MemoryLayer): MemoryEntry[] {
    return [...this.getLayerArray(layer)];
  }

  // 清空 Working
  clearWorking() {
    this.working = [];
  }

  summarizeSession() {
    const sessionEntries = this.session;
    if (sessionEntries.length < 5) return;

    this.session = sessionEntries.slice(-10);
    this.save();
  }

  /**
   * P2: Export memories as human-readable Markdown (Maka/Hermes MEMORY.md format).
   * Includes HTML comment metadata for round-trip compatibility.
   */
  exportMarkdown(): string {
    const lines: string[] = [
      "# Hachimi Memory",
      "",
      `> ${new Date().toISOString().slice(0, 10)} · ${this.longTerm.length} long-term · ${this.session.length} session`,
      "",
    ];

    const appendSection = (title: string, entries: MemoryEntry[]) => {
      if (entries.length === 0) return;
      lines.push(`## ${title}`);
      lines.push("");
      for (const e of entries) {
        const date = new Date(e.createdAt).toISOString().slice(0, 10);
        lines.push(
          `<!-- id=${e.id} layer=${e.layer} importance=${e.importance.toFixed(2)} date=${date} source=${e.source ?? "-"} -->`
        );
        const body = e.content.length > 200 ? e.content.slice(0, 197) + "…" : e.content;
        lines.push(`- ${body}`);
        lines.push("");
      }
    };

    appendSection("Long-term Memory", this.longTerm);
    appendSection("Session Memory", this.session);

    return lines.join("\n");
  }

  export() {
    return {
      working: this.working,
      session: this.session,
      longTerm: this.longTerm,
      archival: this.archival,
    };
  }

  import(data: ReturnType<MemoryManager["export"]>) {
    this.working = data.working ?? [];
    this.session = data.session ?? [];
    this.longTerm = data.longTerm ?? [];
    this.archival = data.archival ?? [];
  }

  private getLayerArray(layer: MemoryLayer): MemoryEntry[] {
    switch (layer) {
      case "working":
        return this.working;
      case "session":
        return this.session;
      case "long_term":
        return this.longTerm;
      case "archival":
        return this.archival;
    }
  }

  remember(content: string, importance = 0.7, layer: MemoryLayer = "long_term"): MemoryEntry {
    const normNew = normalizeText(content);
    this.longTerm = this.longTerm.filter((e) => normalizeText(e.content) !== normNew);
    const entry = this.add({
      layer,
      content,
      importance,
      source: "agent", // P3: agent-authored memories are tracked separately
    });
    return entry;
  }

  list(layer?: MemoryLayer): MemoryEntry[] {
    if (layer) {
      return this.getLayer(layer);
    }
    return [
      ...this.getLayer("working"),
      ...this.getLayer("session"),
      ...this.getLayer("long_term"),
      ...this.getLayer("archival"),
    ];
  }

  forget(id: string): boolean {
    const layers: MemoryLayer[] = ["working", "session", "long_term", "archival"];
    for (const layer of layers) {
      const arr = this.getLayerArray(layer);
      const index = arr.findIndex((e) => e.id === id);
      if (index !== -1) {
        arr.splice(index, 1);
        this.save();
        return true;
      }
    }
    return false;
  }

  forgetOld(minAgeDays = 30) {
    const cutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;
    this.longTerm = this.longTerm.filter((e) => e.lastAccessedAt > cutoff);
    this.save();
  }

  /**
   * B5 去重：基于文本归一化与高相似度去重（保留重要度最高者）
   */
  deduplicate() {
    const result: MemoryEntry[] = [];
    for (const entry of this.longTerm) {
      const normContent = normalizeText(entry.content);
      const existingIdx = result.findIndex(
        (e) =>
          normalizeText(e.content) === normContent ||
          jaccardSimilarity(e.content, entry.content) > 0.85
      );
      if (existingIdx === -1) {
        result.push(entry);
      } else {
        if (entry.importance > result[existingIdx].importance) {
          result[existingIdx] = entry;
        }
      }
    }
    this.longTerm = result;
  }

  /**
   * B5 剪枝：结合时间衰减（Time-Decay）过滤低重要性记忆
   */
  prune(minImportance = 0.3, maxCount = 100): { pruned: number; warning?: string } {
    const before = this.longTerm.length;
    const now = Date.now();
    this.longTerm = this.longTerm
      .map((entry) => {
        const ageDays = (now - entry.lastAccessedAt) / (1000 * 60 * 60 * 24);
        const effectiveImportance = entry.importance * 0.98 ** ageDays;
        return { entry, effectiveImportance };
      })
      .filter(({ effectiveImportance }) => effectiveImportance >= minImportance)
      .sort((a, b) => b.effectiveImportance - a.effectiveImportance)
      .map(({ entry }) => entry)
      .slice(0, maxCount);
    this.save();

    const pruned = before - this.longTerm.length;
    const warning =
      pruned > 5
        ? `${pruned} low-importance memories pruned (limit: ${maxCount}). Consider consolidating manually.`
        : undefined;

    return { pruned, warning };
  }

  /**
   * P1: Memory statistics for agent self-awareness (Hermes pattern).
   * Returns counts and estimates so the agent can decide whether to consolidate.
   */
  stats(): { layers: Record<string, { count: number; estChars: number }>; total: number } {
    const layers: Record<string, { count: number; estChars: number }> = {};
    let total = 0;
    for (const layer of ["working", "session", "long_term", "archival"] as MemoryLayer[]) {
      const entries = this.getLayerArray(layer);
      const estChars = entries.reduce((sum, e) => sum + e.content.length, 0);
      layers[layer] = { count: entries.length, estChars };
      total += entries.length;
    }
    return { layers, total };
  }

  cleanup() {
    this.deduplicate();
    this.prune(0.3, 100);
    this.summarizeSession();
    this.save();
  }

  clear(layer: MemoryLayer) {
    switch (layer) {
      case "working":
        this.working = [];
        break;
      case "session":
        this.session = [];
        break;
      case "long_term":
        this.longTerm = [];
        break;
      case "archival":
        this.archival = [];
        break;
    }
  }
}
