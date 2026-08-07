// packages/core/src/goal/goal-runner.test.ts
//
// P2.1: GoalRunner 编排（注入假 deps，不触达 LLM）— 快乐路径 / 质疑者驳回 /
// infra 暂停 / 停滞暂停 / 裁决解析。

import { describe, expect, it, vi } from "vitest";
import type { HarnessRuntime } from "../runtime/harness-runtime.js";
import { createHarnessRuntime } from "../runtime/harness-runtime.js";
import { TaskRegistry } from "../tasks/task-registry.js";
import { GoalRunner, type GoalRunnerDeps, parseVerdict } from "./goal-runner.js";

const fakeRuntime = {} as unknown as HarnessRuntime;

function makeDeps(
  overrides?: Partial<GoalRunnerDeps>
): GoalRunnerDeps & { calls: { act: string[] } } {
  const calls = { act: [] as string[] };
  return {
    plan: vi.fn(async () => ({ success: true, summary: "PLAN: step1, step2" })),
    review: vi.fn(async () => ({ success: true, summary: "Looks good. VERDICT: APPROVE" })),
    act: vi.fn(async (prompt: string) => {
      calls.act.push(prompt);
      return { content: "ACT: implemented everything" };
    }),
    ...overrides,
    calls,
  };
}

describe("GoalRunner", () => {
  it("HarnessRuntime 接线：注册 start_goal / goal_status / goal_list 工具", () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    expect(runtime.goals).toBeDefined();
    expect(runtime.tools.get("start_goal")).toBeDefined();
    expect(runtime.tools.get("goal_status")).toBeDefined();
    expect(runtime.tools.get("goal_list")).toBeDefined();
  });

  it("快乐路径：plan → act → N 个 reviewer 全 APPROVE → completed", async () => {
    const registry = new TaskRegistry();
    const deps = makeDeps();
    const runner = new GoalRunner(fakeRuntime, registry, deps);

    const { goalId, state } = await runner.startGoal({
      objective: "refactor module x",
      reviewers: 3,
    });

    expect(state.phase).toBe("completed");
    expect(state.runCount).toBe(1);
    expect(deps.calls.act).toHaveLength(1);
    expect(deps.calls.act[0]).toContain("refactor module x");
    expect(deps.calls.act[0]).toContain("PLAN: step1, step2");

    const task = registry.getTask(goalId);
    expect(task?.status).toBe("completed");
    expect(task?.taskKind).toBe("goal");
  });

  it("多数 REFUTE → 第二轮 acting 注入异议反馈 → 通过", async () => {
    let reviewRound = 0;
    const actPrompts: string[] = [];
    const deps = makeDeps({
      review: vi.fn(async () => {
        reviewRound++;
        return reviewRound === 1
          ? { success: true, summary: "Missing edge case. VERDICT: REFUTE" }
          : { success: true, summary: "Fixed. VERDICT: APPROVE" };
      }),
      act: vi.fn(async (prompt: string) => {
        actPrompts.push(prompt);
        return { content: `ACT round ${actPrompts.length}` };
      }),
    });
    const runner = new GoalRunner(fakeRuntime, undefined, deps);
    const { state } = await runner.startGoal({ objective: "g", reviewers: 2, maxRuns: 3 });

    expect(state.phase).toBe("completed");
    expect(state.runCount).toBe(2);
    const secondPrompt = actPrompts[1];
    expect(secondPrompt).toContain("VERDICT: REFUTE");
    expect(secondPrompt).toContain("Missing edge case");
    expect(actPrompts).toHaveLength(2);
  });

  it("acting 基础设施错误 → infra 暂停", async () => {
    const deps = makeDeps({
      act: vi.fn(async () => ({ content: "", isError: true, errorDetail: "tool timeout" })),
    });
    const runner = new GoalRunner(fakeRuntime, undefined, deps);
    const { state } = await runner.startGoal({ objective: "g", reviewers: 2 });

    expect(state.phase).toBe("paused");
    expect(state.pauseReason).toBe("infra");
    expect(state.error).toContain("tool timeout");
  });

  it("连续相同执行结果 → no-progress 暂停", async () => {
    const deps = makeDeps({
      act: vi.fn(async () => ({ content: "same boring output" })),
      review: vi.fn(async () => ({ success: true, summary: "not done. VERDICT: REFUTE" })),
    });
    const runner = new GoalRunner(fakeRuntime, undefined, deps);
    const { state } = await runner.startGoal({ objective: "g", reviewers: 2, maxRuns: 5 });

    expect(state.phase).toBe("paused");
    expect(state.pauseReason).toBe("no-progress");
    expect(state.runCount).toBe(2);
  });

  it("达到运行上限且评审驳回 → failed", async () => {
    const deps = makeDeps({
      review: vi.fn(async () => ({ success: true, summary: "still missing. VERDICT: REFUTE" })),
      act: vi.fn(async (prompt: string) => ({ content: `distinct output ${prompt.length}` })),
    });
    const runner = new GoalRunner(fakeRuntime, undefined, deps);
    const { state } = await runner.startGoal({ objective: "g", reviewers: 2, maxRuns: 2 });

    expect(state.phase).toBe("failed");
    expect(state.runCount).toBe(2);
    expect(state.error).toContain("REFUTE");
  });

  it("规划子代理失败 → failed", async () => {
    const deps = makeDeps({
      plan: vi.fn(async () => ({ success: false, summary: "boom" })),
    });
    const runner = new GoalRunner(fakeRuntime, undefined, deps);
    const { state } = await runner.startGoal({ objective: "g" });

    expect(state.phase).toBe("failed");
    expect(deps.calls.act).toHaveLength(0);
  });
});

describe("parseVerdict", () => {
  it("识别 VERDICT: APPROVE / REFUTE", () => {
    expect(parseVerdict("All checks passed.\nVERDICT: APPROVE", "r1").approve).toBe(true);
    expect(parseVerdict("Broken.\nVERDICT: REFUTE", "r2").approve).toBe(false);
  });
  it("无标记保守按 REFUTE", () => {
    const v = parseVerdict("nothing conclusive", "r3");
    expect(v.approve).toBe(false);
    expect(v.reason).toContain("缺少明确 VERDICT");
  });
  it("大小写不敏感", () => {
    expect(parseVerdict("verdict: approve", "r4").approve).toBe(true);
  });
});
