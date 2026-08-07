// packages/core/src/tools/grant-store.test.ts
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractCommandPrefix, GrantStore } from "./grant-store.js";

const dir = join(process.cwd(), "data-test-grants");

describe("GrantStore (P0-4)", () => {
  beforeEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it("extracts command prefix (first two tokens)", () => {
    expect(extractCommandPrefix("npm run build --prod")).toBe("npm run");
    expect(extractCommandPrefix("git status")).toBe("git status");
    expect(extractCommandPrefix("ls -la")).toBe("ls -la");
  });

  it("persists grants across reloads", () => {
    const file = join(dir, "grants.json");
    const s1 = new GrantStore(file);
    const grant = s1.add("/ws/proj-a", "run_command", "npm run build");
    expect(grant).not.toBeNull();

    const s2 = new GrantStore(file);
    expect(s2.find("/ws/proj-a", "run_command", "npm run build --watch")).not.toBeUndefined();
    expect(s2.find("/ws/proj-b", "run_command", "npm run build")).toBeUndefined();
  });

  it("prefix matching is scoped to workspace + tool", () => {
    const store = new GrantStore(join(dir, "grants.json"));
    store.add("/ws/a", "run_command", "npm test");
    expect(store.find("/ws/a", "run_command", "npm test --coverage")).toBeTruthy();
    expect(store.find("/ws/a", "write_file", "npm test")).toBeUndefined();
    expect(store.find(undefined, "run_command", "npm test")).toBeUndefined();
  });

  it("removeAll clears by workspace/tool", () => {
    const store = new GrantStore(join(dir, "grants.json"));
    store.add("/ws/a", "run_command", "npm test");
    store.add("/ws/a", "run_command", "npm run dev");
    store.add("/ws/b", "run_command", "npm test");
    expect(store.removeAll("/ws/a")).toBe(2);
    expect(store.list().length).toBe(1);
  });
});
