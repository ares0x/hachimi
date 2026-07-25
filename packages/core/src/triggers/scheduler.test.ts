// packages/core/src/triggers/scheduler.test.ts
import { existsSync, rmSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ProactiveScheduler } from "./scheduler.js";

describe("F6 Proactive Trigger Scheduler Suite", () => {
  it("schedules, lists, and fires proactive tasks when nextRunAt expires", async () => {
    const testDataDir = "data/test_f6_triggers";
    const scheduler = new ProactiveScheduler(testDataDir);

    const task = scheduler.addTask({
      name: "早晨工作要点提醒",
      prompt: "生成今日工作摘要",
      delayMs: 10,
    });

    expect(task.id).toContain("trig_");
    expect(scheduler.listTasks().length).toBe(1);

    const mockTriggerFn = vi.fn();

    // 等待 15ms
    await new Promise((r) => setTimeout(r, 15));

    await scheduler.checkAndFire(mockTriggerFn);

    expect(mockTriggerFn).toHaveBeenCalledTimes(1);
    expect(mockTriggerFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: "早晨工作要点提醒" })
    );

    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });
});
