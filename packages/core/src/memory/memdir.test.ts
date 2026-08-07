// packages/core/src/memory/memdir.test.ts
//
// P2.5 memdir + autoDream：
// - syncFromEntries 生成索引 + 单条文件；loadIndex 可回读
// - sideQuery 关键词评分 ≤5 条
// - AutoDreamGate 门控（时间/会话数/配置变化）+ 锁文件
// - MemoryManager 整合：会话 → 长期记忆 + memdir 同步
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileJsonStore } from "@hachimi/storage";
import { describe, expect, it } from "vitest";
import { AutoDreamGate } from "./autodream.js";
import { MemoryManager } from "./manager.js";
import { MemdirStore } from "./memdir.js";

describe("P2.5 memdir + autoDream", () => {
  it("syncs long-term entries into index + per-memory files, readable back", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-memdir-"));
    try {
      const memdir = new MemdirStore(dir);
      memdir.syncFromEntries([
        {
          id: "mem_a",
          layer: "long_term",
          content: "用户喜欢手冲咖啡",
          importance: 0.8,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          source: "user",
        } as any,
        {
          id: "mem_b",
          layer: "session",
          content: "不该进 memdir",
          importance: 0.5,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
        } as any,
      ]);

      expect(memdir.countFiles()).toBe(1); // 只有 long_term 落文件
      expect(memdir.readMemory("mem_a")).toContain("手冲咖啡");
      const idx = memdir.loadIndex();
      expect(idx).toHaveLength(1);
      expect(idx[0].content).toContain("手冲咖啡");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sideQuery returns top-k keyword matches (≤5)", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-memdir-"));
    try {
      const memdir = new MemdirStore(dir);
      const entries = Array.from({ length: 8 }, (_, i) => ({
        id: `mem_${i}`,
        layer: "long_term" as const,
        content: i % 2 === 0 ? "咖啡 手冲 烘焙" : "咖啡 拿铁 奶泡",
        importance: 0.5 + i * 0.05,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      }));
      memdir.syncFromEntries(entries as any);

      const hits = memdir.sideQuery("咖啡 手冲", 5);
      expect(hits.length).toBeLessThanOrEqual(5);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every((h) => h.content.includes("咖啡"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AutoDreamGate gates by config change / interval / session count", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-dream-"));
    try {
      const gate = new AutoDreamGate({
        dataDir: dir,
        minIntervalMs: 1000,
        minSessionCount: 3,
        lastRunAt: Date.now(), // 刚整合过
      });
      expect(gate.decide({ sessionEntryCount: 1 }).allowed).toBe(false);
      expect(gate.decide({ configChanged: true, sessionEntryCount: 1 }).allowed).toBe(true);
      expect(gate.decide({ sessionEntryCount: 5 }).allowed).toBe(true); // 会话数达标

      gate.touchLock();
      expect(gate.isLockedFresh()).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("MemoryManager consolidation promotes session → long_term and syncs memdir", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-consolidate-"));
    try {
      const memdir = new MemdirStore(dir);
      const gate = new AutoDreamGate({
        dataDir: dir,
        minIntervalMs: 0,
        minSessionCount: 0,
        lastRunAt: 0,
      });
      const memory = new MemoryManager(join(dir, "memory.json"), new FileJsonStore(), {
        memdir,
        autoDream: gate,
      });

      memory.add({ layer: "session", content: "重要事实 A", importance: 0.9 });
      memory.add({ layer: "session", content: "琐碎小事 B", importance: 0.3 });

      const res = memory.consolidateToLongTerm();
      expect(res.allowed).toBe(true);
      expect(res.promoted).toBe(1); // 只提升重要度 ≥0.6
      expect(memory.getLayer("long_term").some((e) => e.content === "重要事实 A")).toBe(true);
      expect(memory.getLayer("long_term").some((e) => e.content === "琐碎小事 B")).toBe(false);
      // memdir 已同步
      expect(memdir.loadIndex().some((e) => e.content.includes("重要事实 A"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
