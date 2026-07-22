import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "./manager.js";
import { FileDirStore } from "@hachimi/storage";
import { generateId } from "@hachimi/shared";

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
});
