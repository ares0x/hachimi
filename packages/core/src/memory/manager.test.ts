import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MemoryManager } from "./manager.js";
import { FileJsonStore } from "@hachimi/storage";

const dir = join(process.cwd(), "data-test-memory");
const file = join(dir, "memory.json");

describe("MemoryManager persistence", () => {
  beforeEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it("remember + reload keeps long_term entries", () => {
    const store = new FileJsonStore();
    const m1 = new MemoryManager(file, store);
    m1.remember("用户喜欢手冲咖啡", 0.8);

    const m2 = new MemoryManager(file, store);
    const list = m2.list("long_term");
    expect(list.some((e) => e.content.includes("手冲咖啡"))).toBe(true);
  });

  it("search finds personal preference", () => {
    const m = new MemoryManager(file, new FileJsonStore());
    m.remember("用户喜欢手冲咖啡", 0.9);
    const hits = m.search("我喜欢喝什么");
    expect(hits.length).toBeGreaterThan(0);
  });
});
