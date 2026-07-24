// packages/core/src/memory/manager.test.ts
import { unlinkSync } from "node:fs";
import { FileJsonStore } from "@hachimi/storage";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryManager } from "./manager.js";

const testFile = "data/test_memory_suite.json";

describe("MemoryManager", () => {
  afterEach(() => {
    try {
      unlinkSync(testFile);
    } catch {}
  });

  it("remembers and list long_term memories", () => {
    const m = new MemoryManager(testFile, new FileJsonStore());
    m.remember("喜爱喝拿铁", 0.9);
    const list = m.list("long_term");
    expect(list.length).toBe(1);
    expect(list[0].content).toBe("喜爱喝拿铁");
    expect(list[0].importance).toBe(0.9);
  });

  it("deduplicates identical memories", () => {
    const m = new MemoryManager(testFile, new FileJsonStore());
    m.remember("喜欢打乒乓球", 0.8);
    m.remember("喜欢打乒乓球", 0.8);
    m.deduplicate();
    expect(m.list("long_term").length).toBe(1);
  });

  it("prunes low importance long_term memories", () => {
    const m = new MemoryManager(testFile, new FileJsonStore());
    m.add({ layer: "long_term", content: "重要配置", importance: 0.9 });
    m.add({ layer: "long_term", content: "临时噪音", importance: 0.1 });
    m.prune();
    const list = m.list("long_term");
    expect(list.length).toBe(1);
    expect(list[0].content).toBe("重要配置");
  });

  it("summarizes session to keep recent messages", () => {
    const m = new MemoryManager(testFile, new FileJsonStore());
    for (let i = 0; i < 20; i++) {
      m.add({ layer: "session", content: `消息 ${i}` });
    }
    m.cleanup();
    expect(m.list("session").length).toBeLessThanOrEqual(10);
  });

  it("performs hybrid vector similarity search when queryEmbedding is provided", () => {
    const m = new MemoryManager(testFile, new FileJsonStore());
    m.add({ layer: "long_term", content: "咖啡偏好", importance: 0.5, embedding: [1, 0, 0] });
    m.add({ layer: "long_term", content: "编程语言偏好", importance: 0.5, embedding: [0, 1, 0] });

    const results = m.search("咖啡", { queryEmbedding: [0.9, 0.1, 0] });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toBe("咖啡偏好");
  });
});
