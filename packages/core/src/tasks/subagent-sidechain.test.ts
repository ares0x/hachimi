// packages/core/src/tasks/subagent-sidechain.test.ts
//
// P1.3 子代理 sidechain：
// - append / readLastState 往返（只追加，最后一次为准）
// - markOrphanedRunning 把遗留 running 标记为 failed（幂等：只标记一次）
// - 损坏行跳过
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SubAgentSidechain } from "./subagent-sidechain.js";

describe("P1.3 sub-agent sidechain persistence", () => {
  it("appends state snapshots and reads back the last one", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-side-"));
    const side = new SubAgentSidechain(dir);

    side.append("sess_sub_1", {
      taskId: "task_sub_a",
      subSessionId: "sess_sub_1",
      status: "running",
      durationMs: 0,
      updatedAt: 1000,
    });
    side.append("sess_sub_1", {
      taskId: "task_sub_a",
      subSessionId: "sess_sub_1",
      status: "completed",
      summary: "done",
      durationMs: 500,
      updatedAt: 2000,
    });

    const last = side.readLastState("sess_sub_1");
    expect(last?.status).toBe("completed");
    expect(last?.summary).toBe("done");
    expect(last?.durationMs).toBe(500);
    expect(side.readLastState("sess_missing")).toBeUndefined();
  });

  it("marks orphaned running tasks as failed on boot, idempotently", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-side-"));
    const side = new SubAgentSidechain(dir);

    side.append("sess_sub_orphan", {
      taskId: "task_sub_o",
      subSessionId: "sess_sub_orphan",
      status: "running",
      durationMs: 100,
      updatedAt: 1000,
    });

    expect(side.markOrphanedRunning()).toBe(1);
    const last = side.readLastState("sess_sub_orphan");
    expect(last?.status).toBe("failed");
    expect(last?.orphanRecovered).toBe(true);

    // 幂等：第二次不再重复标记
    expect(side.markOrphanedRunning()).toBe(0);
  });

  it("skips corrupt lines when reading", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-side-"));
    const side = new SubAgentSidechain(dir);
    const path = join(dir, "subagents", "sess_sub_bad.jsonl");
    writeFileSync(
      path,
      '{"taskId":"t1","status":"running","subSessionId":"sess_sub_bad"}\n{corrupt json}\n{"taskId":"t1","status":"completed","subSessionId":"sess_sub_bad","durationMs":1,"updatedAt":2}\n',
      "utf-8"
    );
    expect(existsSync(path)).toBe(true);
    const last = side.readLastState("sess_sub_bad");
    expect(last?.status).toBe("completed");
  });
});
