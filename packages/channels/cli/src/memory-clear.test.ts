import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearLocalData } from "./memory-clear.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hachimi-clear-"));
  mkdirSync(join(dir, "sessions"));
  mkdirSync(join(dir, "events"));
  writeFileSync(join(dir, "memory.json"), "{}");
  writeFileSync(join(dir, "sessions", "s1.json"), "{}");
  writeFileSync(join(dir, "sessions", "s2.json"), "{}");
  writeFileSync(join(dir, "events", "s1.jsonl"), "{}");
});

afterEach(() => {
  // leave cleanup to OS temp; files are removed by the assertions anyway
});

describe("clearLocalData", () => {
  it("clears memories only", () => {
    const result = clearLocalData(dir, { memories: true, sessions: false });
    expect(result.memoriesRemoved).toBe(1);
    expect(result.sessionsRemoved).toBe(0);
    expect(existsSync(join(dir, "memory.json"))).toBe(false);
    expect(existsSync(join(dir, "sessions", "s1.json"))).toBe(true);
  });

  it("clears sessions only (json + event logs)", () => {
    const result = clearLocalData(dir, { memories: false, sessions: true });
    expect(result.sessionsRemoved).toBe(3);
    expect(existsSync(join(dir, "memory.json"))).toBe(true);
    expect(readdirSync(join(dir, "sessions"))).toHaveLength(0);
    expect(readdirSync(join(dir, "events"))).toHaveLength(0);
  });

  it("clears everything with --all semantics", () => {
    const result = clearLocalData(dir, { memories: true, sessions: true });
    expect(result.removed).toBe(4);
    expect(existsSync(join(dir, "memory.json"))).toBe(false);
    expect(existsSync(join(dir, "sessions", "s1.json"))).toBe(false);
    expect(existsSync(join(dir, "events", "s1.jsonl"))).toBe(false);
  });

  it("is a no-op when nothing matches", () => {
    const result = clearLocalData(dir, { memories: true, sessions: true });
    const second = clearLocalData(dir, { memories: true, sessions: true });
    expect(second.removed).toBe(0);
    expect(result.removed).toBe(4);
  });
});
