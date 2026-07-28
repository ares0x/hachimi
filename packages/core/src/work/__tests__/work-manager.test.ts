// packages/core/src/work/__tests__/work-manager.test.ts
/**
 * W1.3 + W2.2: WorkManager + Plan / Status 流转 / WorkManager 创建与绑定 session 的单测
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileEventStore } from "../../events/file-event-store.js";
import type { PlanStepStatus } from "../../types/work.js";
import { WorkManager } from "../work-manager.js";

let tmpDir: string;
let store: FileEventStore;
let wm: WorkManager;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "hachimi-work-test-"));
  store = new FileEventStore(tmpDir);
  wm = new WorkManager(tmpDir, store);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("W1 WorkManager", () => {
  it("create: 新建 primary Work 时自动绑定 sessionId，并生成可读标题", () => {
    const w = wm.create({
      intent: "帮我分析一下 Hachimi 项目的目标和范围，列出计划",
      sessionId: "sess_work_001",
      kind: "primary",
    });
    expect(w.id).toBeDefined();
    expect(w.kind).toBe("primary");
    expect(w.status).toBe("active");
    expect(w.sessionIds).toContain("sess_work_001");
    expect(w.title.length).toBeGreaterThan(0);
    // 禁止纯时间戳标题
    expect(/^\d+$/.test(w.title)).toBe(false);
    expect(w.title).toContain("Hachimi");
  });

  it("W1.3 updatePlan: 写入后可以读回，步骤拥有独立 step_id", () => {
    const w = wm.create({ intent: "写博客", sessionId: "sess_plan" });
    const steps: Array<{
      title: string;
      status: PlanStepStatus;
      description?: string;
    }> = [
      { title: "选题", status: "done" },
      { title: "收集资料", status: "running" },
      {
        title: "撰写草稿",
        status: "pending",
        description: "先写大纲再填充段落",
      },
    ];
    const updated = wm.updatePlan(w.id, steps);
    expect(updated).not.toBeNull();
    expect(updated!.plan).toHaveLength(3);
    // 每个 step 都被分配了 id
    expect(updated!.plan.every((s) => s.id.startsWith("step_"))).toBe(true);
    expect(updated!.plan[0].status).toBe("done");
    expect(updated!.plan[2].description).toBe("先写大纲再填充段落");

    // 持久化：新实例读取一致
    const wm2 = new WorkManager(tmpDir, store);
    const reRead = wm2.get(w.id);
    expect(reRead?.plan).toHaveLength(3);
    expect(reRead?.plan[1].status).toBe("running");
  });

  it("W1.3 updateStepStatus: 状态流转，且 done 时写入 completedAt", () => {
    const w = wm.create({ intent: "做三件事", sessionId: "sess_step" });
    wm.updatePlan(w.id, [
      { title: "A", status: "pending" },
      { title: "B", status: "pending" },
    ]);
    // updatePlan 返回的是最新 Work（plan 已赋值 step_id），需要重新 get 确保引用一致
    const refreshedBefore = wm.get(w.id)!;
    const step1 = refreshedBefore.plan[0];
    expect(step1?.id).toBeDefined();

    const before = new Date().toISOString();
    wm.updateStepStatus(w.id, step1.id, "done");
    const refreshed = wm.get(w.id);
    expect(refreshed!.plan[0].status).toBe("done");
    expect(refreshed!.plan[0].completedAt).toBeDefined();
    expect(refreshed!.plan[0].completedAt! >= before).toBe(true);
    // 非 done 不写入 completedAt
    expect(refreshed!.plan[1].completedAt).toBeUndefined();
  });

  it("W2.2 setStatus → failed / archived，影响 list 的 status 过滤", () => {
    const a = wm.create({ intent: "A 任务", sessionId: "s_a" });
    const b = wm.create({ intent: "B 任务", sessionId: "s_b" });
    wm.setStatus(a.id, "failed");
    wm.setStatus(b.id, "archived");

    const actives = wm.list({ status: ["active"] });
    expect(actives.find((w) => w.id === a.id)).toBeUndefined();

    const failed = wm.list({ status: ["failed"] });
    expect(failed.find((w) => w.id === a.id)).toBeDefined();
    expect(failed.find((w) => w.id === b.id)).toBeUndefined();
  });

  it("W1.7 worker kind: 默认 primary list 不展示 worker（防刷屏）", () => {
    const parent = wm.create({
      intent: "主任务",
      sessionId: "sess_parent",
      kind: "primary",
    });
    wm.create({
      intent: "子任务 - 检索网页",
      sessionId: "sess_worker1",
      kind: "worker",
      parentWorkId: parent.id,
    });
    wm.create({
      intent: "子任务 - 写代码",
      sessionId: "sess_worker2",
      kind: "worker",
      parentWorkId: parent.id,
    });

    // 默认只返回 primary（防 Rail 刷屏）
    const primaries = wm.list({ kind: "primary" });
    expect(primaries.every((w) => w.kind === "primary")).toBe(true);
    expect(primaries).toHaveLength(1);

    const workers = wm.listChildren(parent.id);
    expect(workers).toHaveLength(2);
    expect(workers.every((w) => w.parentWorkId === parent.id)).toBe(true);
  });
});
