// packages/core/src/h3-harness-elevation.test.ts
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { truncateDomainContent } from "./context/builder.js";
import { FileEventStore } from "./events/file-event-store.js";
import { PathJail } from "./sandbox/path-jail.js";
import { readFileTool } from "./tools/builtin/fs/read-file.js";
import { runCommandTool } from "./tools/builtin/shell/run-command.js";

describe("Phase H3 — Harness Engineering Elevation Suite", () => {
  const testDir = join(__dirname, "../../data-test-h3");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("H3.1: run_command respects AbortSignal and aborts sub-process on signal abort", async () => {
    const jail = new PathJail({ workspaceRoot: testDir });
    const ac = new AbortController();

    // 立即打断控制器
    ac.abort();

    const start = Date.now();
    const res = await runCommandTool.execute(
      { command: "sleep", args: ["10"] },
      { jail, workspaceRoot: testDir, signal: ac.signal }
    );
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
    expect(res).toContain("[命令失败]");
  });

  it("H3.2: truncateDomainContent performs structural truncation on Git Diff and Error Stack Trace", () => {
    // 1) 大 Git Diff 测试
    const diffHeader = "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n";
    const dummyHunks = Array.from(
      { length: 300 },
      (_, i) => `@@ -${i},1 +${i},1 @@\n+const line_${i} = true;`
    ).join("\n");
    const fullDiff = diffHeader + dummyHunks;

    const truncatedDiff = truncateDomainContent(fullDiff, 100);
    expect(truncatedDiff).toContain("diff --git");
    expect(truncatedDiff).toContain("...Git Diff 超长结构化折叠");

    // 2) Stack Trace 测试
    const fullStack =
      "Error: Unhandled exception\n" +
      Array.from({ length: 100 }, (_, i) => `    at function${i} (app.ts:${i}:1)`).join("\n");
    const truncatedStack = truncateDomainContent(fullStack, 100);
    expect(truncatedStack).toContain("Error: Unhandled exception");
    expect(truncatedStack).toContain("...中间调用栈折叠");
  });

  it("H3.3: FileEventStore automatically assigns monotonically increasing seq IDs", async () => {
    const store = new FileEventStore(testDir);
    const sessionId = "sess_h3_seq_test";

    await store.append({
      id: "evt_1",
      sessionId,
      type: "session_started",
      timestamp: new Date().toISOString(),
      payload: {},
    });

    await store.append({
      id: "evt_2",
      sessionId,
      type: "user_message",
      timestamp: new Date().toISOString(),
      payload: { content: "hello" },
    });

    const result = await store.list(sessionId);
    expect(result.events.length).toBe(2);
    expect(result.events[0].seq).toBe(1);
    expect(result.events[1].seq).toBe(2);
  });

  it("H3.4: readFileTool exposes readOnly and isIdempotent metadata", () => {
    expect(readFileTool.readOnly).toBe(true);
    expect(readFileTool.isIdempotent).toBe(true);
  });
});
