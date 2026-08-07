// packages/core/src/goal/goal-machine.test.ts
//
// P2.1: 纯状态机 — 转移 / 停滞检测 / 运行上限 / 暂停恢复 / 质疑者多数裁决。

import { describe, expect, it } from "vitest";
import {
  GOAL_BACKOFF_MS,
  GOAL_STALL_THRESHOLD,
  GoalMachine,
  type GoalVerdict,
  gapFingerprint,
} from "./goal-machine.js";

describe("GoalMachine", () => {
  it("start → planning，markPlanReady → acting", () => {
    const s = GoalMachine.start("refactor x", { goalId: "goal_1", maxRuns: 3 });
    expect(s.phase).toBe("planning");
    expect(s.runCount).toBe(0);
    const m = new GoalMachine(s);
    const ready = m.markPlanReady("step1\nstep2");
    expect(ready.phase).toBe("acting");
    expect(ready.plan).toContain("step1");
  });

  it("markRunCompleted 递增 runCount 并记录指纹", () => {
    const m = new GoalMachine(GoalMachine.start("g", { goalId: "goal_2", maxRuns: 10 }));
    m.markPlanReady("p");
    const s = m.markRunCompleted("done v1");
    expect(s.runCount).toBe(1);
    expect(s.phase).toBe("acting");
    expect(s.lastGapFingerprint).toBe(gapFingerprint("done v1"));
  });

  it("连续相同指纹触发 no-progress 暂停", () => {
    const m = new GoalMachine(GoalMachine.start("g", { goalId: "goal_3", maxRuns: 10 }));
    m.markPlanReady("p");
    m.markRunCompleted("same output");
    const s = m.markRunCompleted("same output");
    expect(s.phase).toBe("paused");
    expect(s.pauseReason).toBe("no-progress");
    expect(s.consecutiveStalls).toBe(GOAL_STALL_THRESHOLD);
  });

  it("不同指纹重置停滞计数", () => {
    const m = new GoalMachine(GoalMachine.start("g", { goalId: "goal_4", maxRuns: 10 }));
    m.markPlanReady("p");
    m.markRunCompleted("same");
    const s = m.markRunCompleted("different");
    expect(s.phase).toBe("acting");
    expect(s.consecutiveStalls).toBe(1);
  });

  it("backoff 暂停：到期前 resume 拒绝，到期后恢复", () => {
    const m = new GoalMachine(GoalMachine.start("g", { goalId: "goal_5", maxRuns: 10 }));
    m.markPlanReady("p");
    const until = Date.now() + GOAL_BACKOFF_MS;
    const s = m.pause("backoff", "rate limit", until);
    expect(s.phase).toBe("paused");
    expect(s.pauseReason).toBe("backoff");
    expect(s.pausedUntil).toBe(until);

    const before = m.resume(until - 1);
    expect(before.phase).toBe("paused");
    const after = m.resume(until + 1000);
    expect(after.phase).toBe("acting");
    expect(after.consecutiveStalls).toBe(0);
  });

  it("recordVerdicts：多数 APPROVE → completed", () => {
    const m = new GoalMachine(GoalMachine.start("g", { goalId: "goal_6", maxRuns: 5 }));
    m.markPlanReady("p");
    m.markRunCompleted("result");
    m.markVerifying();
    const verdicts: GoalVerdict[] = [
      { reviewerId: "r1", approve: true, reason: "ok" },
      { reviewerId: "r2", approve: true, reason: "ok" },
      { reviewerId: "r3", approve: false, reason: "nit" },
    ];
    const s = m.recordVerdicts(verdicts);
    expect(s.phase).toBe("completed");
    expect(s.verdicts).toHaveLength(3);
  });

  it("多数 REFUTE 且有 run 余量 → 回到 acting", () => {
    const m = new GoalMachine(GoalMachine.start("g", { goalId: "goal_7", maxRuns: 5 }));
    m.markPlanReady("p");
    m.markRunCompleted("result");
    m.markVerifying();
    const s = m.recordVerdicts([
      { reviewerId: "r1", approve: false, reason: "missing" },
      { reviewerId: "r2", approve: false, reason: "broken" },
      { reviewerId: "r3", approve: true, reason: "ok" },
    ]);
    expect(s.phase).toBe("acting");
    expect(s.runCount).toBe(1);
  });

  it("多数 REFUTE 且耗尽运行次数 → failed", () => {
    const m = new GoalMachine(GoalMachine.start("g", { goalId: "goal_8", maxRuns: 1 }));
    m.markPlanReady("p");
    m.markRunCompleted("result");
    m.markVerifying();
    const s = m.recordVerdicts([
      { reviewerId: "r1", approve: false, reason: "missing" },
      { reviewerId: "r2", approve: false, reason: "broken" },
    ]);
    expect(s.phase).toBe("failed");
    expect(s.error).toContain("REFUTE");
  });

  it("infra 暂停与 resume", () => {
    const m = new GoalMachine(GoalMachine.start("g", { goalId: "goal_9", maxRuns: 5 }));
    m.markPlanReady("p");
    const s = m.markInfraPause("tool timeout");
    expect(s.phase).toBe("paused");
    expect(s.pauseReason).toBe("infra");
    expect(m.resume().phase).toBe("acting");
  });

  it("gapFingerprint 忽略空白差异", () => {
    expect(gapFingerprint(" a  b ")).toBe(gapFingerprint("a b"));
    expect(gapFingerprint("a b")).not.toBe(gapFingerprint("a c"));
  });
});
