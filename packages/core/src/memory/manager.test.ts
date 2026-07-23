import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MemoryManager } from "./manager.js";
import { FileJsonStore } from "@hachimi/storage";

const testDir = join(process.cwd(), "data-test-memory");
const testFile = join(testDir, "memory.json");

describe("MemoryManager persistence", () => {
  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it("remember + reload keeps long_term entries", () => {
    const store = new FileJsonStore();
    const m1 = new MemoryManager(testFile, store);
    m1.remember("用户喜欢手冲咖啡", 0.8);

    const m2 = new MemoryManager(testFile, store);
    const list = m2.list("long_term");
    expect(list.some((e) => e.content.includes("手冲咖啡"))).toBe(true);
  });

  it("search finds personal preference", () => {
    const m = new MemoryManager(testFile, new FileJsonStore());
    m.remember("用户喜欢手冲咖啡", 0.9);
    const hits = m.search("我喜欢喝什么");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("deduplicates same content keeping highest importance", () => {
      const m = new MemoryManager(testFile, new FileJsonStore());
      m.remember("用户喜欢喝咖啡", 0.6);
      m.remember("用户喜欢喝咖啡", 0.9);
      m.cleanup();
      const list = m.list("long_term");
      expect(list.length).toBe(1);
      expect(list[0].importance).toBe(0.9);
    });

  it("summarizes session to keep recent messages", () => {
    const m = new MemoryManager(testFile, new FileJsonStore());
    for (let i = 0; i < 20; i++) {
      m.add({ layer: "session", content: `消息 ${i}` });
    }
    m.cleanup();
    expect(m.session.length).toBeLessThanOrEqual(10);
  });
});
