// packages/core/src/tasks/activity-policy.test.ts
//
// P2.8 电源/活动感知后台策略：
// - 活跃租约内 → 禁止后台触发；租约过期 → 允许（非电池/锁定）
// - 电池 / 锁定 → 禁止
// - ProactiveScheduler 接入策略（禁止时整轮跳过）
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProactiveScheduler } from "../triggers/scheduler.js";
import { ActivityPolicy } from "./activity-policy.js";

describe("P2.8 power/activity-aware background policy", () => {
  it("blocks background work during the activity lease", () => {
    const policy = new ActivityPolicy({
      activityLeaseMs: 60_000,
      powerStateOverride: { onBattery: false, locked: false },
    });
    policy.markActivity();
    expect(policy.isUserActive()).toBe(true);
    expect(policy.shouldRunBackground()).toBe(false);
  });

  it("allows background work after the lease expires (AC, unlocked)", () => {
    const policy = new ActivityPolicy({
      activityLeaseMs: 1,
      powerStateOverride: { onBattery: false, locked: false },
    });
    policy.markActivity();
    // 租约 1ms 已过期
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(policy.isUserActive()).toBe(false);
        expect(policy.shouldRunBackground()).toBe(true);
        resolve();
      }, 10);
    });
  });

  it("blocks background work on battery or when locked", () => {
    const onBattery = new ActivityPolicy({
      powerStateOverride: { onBattery: true, locked: false },
    });
    expect(onBattery.shouldRunBackground()).toBe(false);

    const locked = new ActivityPolicy({
      powerStateOverride: { onBattery: false, locked: true },
    });
    expect(locked.shouldRunBackground()).toBe(false);
  });

  it("ProactiveScheduler skips the whole fire cycle when policy blocks", async () => {
    // 两个 scheduler 使用独立数据目录，避免共享 scheduler.json 造成任务串扰；
    // delayMs 用 -1（恒到期）避免 addTask 与 checkAndFire 同毫秒执行时任务未到期。
    const dir = mkdtempSync(join(tmpdir(), "hachimi-trig-"));
    const dir2 = mkdtempSync(join(tmpdir(), "hachimi-trig-allow-"));
    try {
      const blocking = new ActivityPolicy({
        powerStateOverride: { onBattery: true, locked: false },
      });
      const scheduler = new ProactiveScheduler(dir, blocking);
      scheduler.addTask({
        name: "remind",
        prompt: "该喝水了",
        delayMs: 1,
        channel: "telegram",
      });

      let fired = 0;
      await scheduler.checkAndFire(async () => {
        fired++;
      });
      expect(fired).toBe(0);

      // 策略允许 → 正常触发
      const allowing = new ActivityPolicy({
        powerStateOverride: { onBattery: false, locked: false },
        activityLeaseMs: -1,
      });
      const scheduler2 = new ProactiveScheduler(dir2, allowing);
      scheduler2.addTask({
        name: "remind2",
        prompt: "该喝水了",
        delayMs: -1,
        channel: "telegram",
      });
      await scheduler2.checkAndFire(async () => {
        fired++;
      });
      expect(fired).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});
