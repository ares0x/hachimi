import { describe, expect, it } from "vitest";
import { BackgroundTaskManager } from "./background-task-manager.js";

describe("BackgroundTaskManager task events (L1-B10)", () => {
  it("emits running then completed events", async () => {
    const mgr = new BackgroundTaskManager();
    const events: Array<{ status: string; taskId: string }> = [];
    const unsubscribe = mgr.onTaskEvent((e) => events.push({ status: e.status, taskId: e.taskId }));

    const task = mgr.startCommand("sleep 0.05 && echo ok", { label: "ping" });
    const output = await mgr.getOutput(task.taskId, 5000);
    expect(output?.status).toBe("completed");

    // wait for microtask emission
    await new Promise((r) => setTimeout(r, 10));
    expect(events.map((e) => e.status)).toEqual(["running", "completed"]);
    expect(events[0].taskId).toBe(task.taskId);
    unsubscribe();
  });

  it("emits failed on non-zero exit", async () => {
    const mgr = new BackgroundTaskManager();
    const statuses: string[] = [];
    mgr.onTaskEvent((e) => statuses.push(e.status));

    const task = mgr.startCommand("exit 3");
    await mgr.getOutput(task.taskId, 5000);
    await new Promise((r) => setTimeout(r, 10));
    expect(statuses).toContain("failed");
  });

  it("supports unsubscribe", async () => {
    const mgr = new BackgroundTaskManager();
    let count = 0;
    const unsub = mgr.onTaskEvent(() => count++);
    unsub();
    mgr.startCommand("echo x");
    await new Promise((r) => setTimeout(r, 10));
    expect(count).toBe(0);
  });
});
