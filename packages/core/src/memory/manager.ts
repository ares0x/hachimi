import { generateId } from "@hachimi/shared";
import type {  MemorySearchOptions } from "./types.js";
import type { MemoryEntry, MemoryLayer } from "../types/index.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class MemoryManager {
  private working: MemoryEntry[] = [];
  private session: MemoryEntry[] = [];
  private longTerm: MemoryEntry[] = [];
  private archival: MemoryEntry[] = [];

  private filePath: string;

  constructor(filePath = "data/memory.json") {
    this.filePath = filePath;
    this.load(); // 实例化时自动加载
  }

  /** 从文件加载记忆 */
  load() {
    try {
      if (!existsSync(this.filePath)) return;

      const raw = readFileSync(this.filePath, "utf-8");
      const data = JSON.parse(raw);

      this.working = data.working ?? [];
      this.session = data.session ?? [];
      this.longTerm = data.longTerm ?? [];
      this.archival = data.archival ?? [];

      console.log(`[Memory] 已从 ${this.filePath} 加载记忆`);
    } catch (err) {
      console.warn("[Memory] 加载失败，使用空记忆", err);
    }
  }

  /** 保存记忆到文件 */
  save() {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data = {
        working: this.working,
        session: this.session,
        longTerm: this.longTerm,
        archival: this.archival,
      };

      writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("[Memory] 保存失败", err);
    }
  }

  // 添加记忆
  add(params: {
    layer: MemoryLayer;
    content: string;
    importance?: number;
    metadata?: Record<string, unknown>;
  }): MemoryEntry {
    const entry: MemoryEntry = {
      id: generateId("mem_"),
      layer: params.layer,
      content: params.content,
      importance: params.importance ?? 0.5,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      metadata: params.metadata,
    };

    this.getLayerArray(params.layer).push(entry);
    this.save();          // 新增：自动保存
    return entry;
  }

  search(query: string, options: MemorySearchOptions = {}): MemoryEntry[] {
    const {
      layers = ["working", "session", "long_term"],
      limit = 8,
      minImportance = 0,
    } = options;

    const all: MemoryEntry[] = [];
    for (const layer of layers) {
      all.push(...this.getLayerArray(layer));
    }

    // 临时策略（Phase 2 演示用）：
    // 如果查询较长或包含个人相关词，直接返回高重要性的长期记忆
    const personalKeywords = ["我", "谁", "名字", "项目", "技术", "做什么", "开发"];
    const isPersonalQuery = personalKeywords.some((kw) => query.includes(kw));

    let results = all.filter((e) => e.importance >= minImportance);

    if (isPersonalQuery) {
      // 个人相关问题 → 优先返回 long_term 高重要性记忆
      results = results
        .filter((e) => e.layer === "long_term" || e.layer === "session")
        .sort((a, b) => b.importance - a.importance)
        .slice(0, limit);
    } else {
      // 普通问题 → 简单包含匹配
      const lowerQuery = query.toLowerCase();
      results = results
        .filter((e) => e.content.toLowerCase().includes(lowerQuery) || lowerQuery.length < 4)
        .sort((a, b) => b.importance - a.importance)
        .slice(0, limit);
    }

    // 更新访问时间
    return results.map((e) => {
      e.lastAccessedAt = Date.now();
      return e;
    });
  }

  // 获取某层所有记忆
  getLayer(layer: MemoryLayer): MemoryEntry[] {
    return [...this.getLayerArray(layer)];
  }

  // 清空 Working（新会话时常用）
  clearWorking() {
    this.working = [];
  }

  // 简单会话摘要（Phase 2 先做规则版，后续可让 LLM 生成）
  summarizeSession(): string {
    const important = this.session
      .filter((e) => e.importance >= 0.6)
      .map((e) => e.content)
      .join("；");
    return important || "本会话暂无高重要性记忆";
  }

  // 导出（方便后续持久化）
  export() {
    return {
      working: this.working,
      session: this.session,
      longTerm: this.longTerm,
      archival: this.archival,
    };
  }

  // 导入
  import(data: ReturnType<MemoryManager["export"]>) {
    this.working = data.working ?? [];
    this.session = data.session ?? [];
    this.longTerm = data.longTerm ?? [];
    this.archival = data.archival ?? [];
  }

  private getLayerArray(layer: MemoryLayer): MemoryEntry[] {
    switch (layer) {
      case "working": return this.working;
      case "session": return this.session;
      case "long_term": return this.longTerm;
      case "archival": return this.archival;
    }
  }

  // 在 MemoryManager 类中新增以下方法

  /**
   * 快捷记住一条信息（默认写入 long_term）
   */
  remember(content: string, importance = 0.7, layer: MemoryLayer = "long_term"): MemoryEntry {
    return this.add({
      layer,
      content,
      importance,
    });
  }

  /**
   * 查看某层记忆
   */
  list(layer?: MemoryLayer): MemoryEntry[] {
    if (layer) {
      return this.getLayer(layer);
    }
    // 不传参数则返回所有层
    return [
      ...this.getLayer("working"),
      ...this.getLayer("session"),
      ...this.getLayer("long_term"),
      ...this.getLayer("archival"),
    ];
  }

  /**
   * 删除一条记忆
   */
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

  /**
   * 清空某一层
   */
  clear(layer: MemoryLayer) {
    switch (layer) {
      case "working": this.working = []; break;
      case "session": this.session = []; break;
      case "long_term": this.longTerm = []; break;
      case "archival": this.archival = []; break;
    }
  }
}
