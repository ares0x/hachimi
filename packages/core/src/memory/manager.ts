import { generateId } from "@hachimi/shared";
import type {  MemorySearchOptions } from "./types.js";
import type { MemoryEntry, MemoryLayer } from "../types/index.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { JsonFileStore } from "@hachimi/storage";
import { FileJsonStore } from "@hachimi/storage";

interface MemoryData {
  working: MemoryEntry[];
  session: MemoryEntry[];
  longTerm: MemoryEntry[];
  archival: MemoryEntry[];
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
      this.cleanup();
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
     // 先清理同类
     this.longTerm = this.longTerm.filter(e =>
       e.content.toLowerCase().replace(/[\s\d，。？！、；：""''（）()]+/g, "") !==
       content.toLowerCase().replace(/[\s\d，。？！、；：""''（）()]+/g, "")
     );
     const entry = this.add({
       layer,
       content,
       importance,
     });
     return entry;
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
   * 去重：相同内容只保留 importance 最高的那条
   */
   deduplicate() {
     const seen = new Map<string, MemoryEntry>();
     for (const entry of this.longTerm) {
       const key = entry.content
         .toLowerCase()
         .replace(/[\s\d，。？！、；：""''（）()]+/g, "")
         .trim();
       const existing = seen.get(key);
       if (!existing || entry.importance > existing.importance) {
         seen.set(key, entry);
       }
     }
     this.longTerm = Array.from(seen.values());
   }


  /**
   * 清理低重要性记忆（可选定期调用）
   */
  prune(minImportance = 0.3, maxCount = 100) {
    this.longTerm = this.longTerm
      .filter((e) => e.importance >= minImportance)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, maxCount);
    this.save();
  }

  /**
   * 自动去重 + 清理（推荐在 add 后调用）
   */
  cleanup() {
    this.deduplicate();
    this.prune(0.3, 100);
    this.save();
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
