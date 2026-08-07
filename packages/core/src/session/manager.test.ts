import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { generateId } from "@hachimi/shared";
import { FileDirStore } from "@hachimi/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionManager } from "./manager.js";

const dir = join(process.cwd(), "data-test-sessions");

describe("SessionManager persistence", () => {
  beforeEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it("appendMessage survives reload", () => {
    const store = new FileDirStore();
    const s1 = new SessionManager(dir, store);
    const session = s1.getOrCreate();

    s1.appendMessage({
      id: generateId("msg_"),
      role: "user",
      content: "你好",
      timestamp: Date.now(),
    });

    const s2 = new SessionManager(dir, store);
    const loaded = s2.load(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.messages.some((m) => m.content === "你好")).toBe(true);
  });

  it("list() filters out internal sub-agent sessions (sub_sess_*)", () => {
    const store = new FileDirStore();
    const manager = new SessionManager(dir, store);
    const userSession = manager.getOrCreate();
    manager.create(undefined, "sub_sess_internal_001");

    const list = manager.list();
    expect(list.some((s) => s.id === "sub_sess_internal_001")).toBe(false);
    expect(list.some((s) => s.id === userSession.id)).toBe(true);
  });

  it("autoCompact uses the semantic summarizer when provided (P2.9)", async () => {
    const store = new FileDirStore();
    const manager = new SessionManager(dir, store);
    const session = manager.getOrCreate();

    for (let i = 0; i < 40; i++) {
      manager.appendMessage({
        id: generateId(`msg_${i}`),
        role: i % 2 === 0 ? "user" : "assistant",
        content: `历史消息 ${i}`,
        timestamp: Date.now() + i,
      });
    }

    const summarizer = async (pruned: import("../types/index.js").Message[]) =>
      `【语义总结】共压缩 ${pruned.length} 条：目标是 X，已完成 Y，待办 Z。`;

    const ok = await manager.autoCompact(session.id, 30, 16, summarizer);
    expect(ok).toBe(true);

    const after = manager.load(session.id)!;
    const archive = after.messages.find((m) => m.role === "system");
    expect(archive).toBeDefined();
    expect(String(archive?.content)).toContain("【语义总结】");
    expect(String(archive?.content)).toContain("已完成 Y");
    // 保留首条初始目标 + 最近 16 条
    expect(after.messages.length).toBeLessThanOrEqual(18);
  });
});
