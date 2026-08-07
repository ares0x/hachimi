// packages/core/src/tasks/background-task-manager.test.ts
import { describe, expect, it } from "vitest";
import { BackgroundTaskManager } from "./background-task-manager.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("BackgroundTaskManager (P0-3)", () => {
  it("starts a command in background and returns a task id immediately", async () => {
    const mgr = new BackgroundTaskManager();
    const task = mgr.startCommand("sleep 0.2 && echo done");
    expect(task.taskId).toMatch(/^bg_/);
    expect(task.status).toBe("running");

    const result = await mgr.getOutput(task.taskId, 5000);
    expect(result?.status).toBe("completed");
    expect(result?.output).toContain("done");
  });

  it("marks failed commands with exit code", async () => {
    const mgr = new BackgroundTaskManager();
    const task = mgr.startCommand("exit 3");
    const result = await mgr.getOutput(task.taskId, 5000);
    expect(result?.status).toBe("failed");
    expect(result?.exitCode).toBe(3);
  });

  it("wait with mode=all returns when every task completes", async () => {
    const mgr = new BackgroundTaskManager();
    const t1 = mgr.startCommand("sleep 0.1");
    const t2 = mgr.startCommand("sleep 0.2");
    const results = await mgr.wait([t1.taskId, t2.taskId], "all", 5000);
    expect(results.every((t) => t.status === "completed")).toBe(true);
  });

  it("wait with mode=any returns on first completion", async () => {
    const mgr = new BackgroundTaskManager();
    const slow = mgr.startCommand("sleep 1");
    const fast = mgr.startCommand("sleep 0.05 && echo fast");
    const results = await mgr.wait([slow.taskId, fast.taskId], "any", 5000);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].output).toContain("fast");
  });

  it("caps output at maxBufferBytes", async () => {
    const mgr = new BackgroundTaskManager({ maxBufferBytes: 100 });
    const task = mgr.startCommand("printf 'a%.0s' {1..500}");
    const result = await mgr.getOutput(task.taskId, 5000);
    expect(result!.output.length).toBeLessThanOrEqual(200);
    expect(result!.output).toContain("已截断");
  });

  it("kill terminates a running command", async () => {
    const mgr = new BackgroundTaskManager();
    const task = mgr.startCommand("sleep 30");
    expect(task.status).toBe("running");
    const killed = await mgr.kill(task.taskId);
    expect(killed).toBe(true);
    const result = await mgr.getOutput(task.taskId, 3000);
    expect(["killed", "failed"]).toContain(result?.status);
  });
});
