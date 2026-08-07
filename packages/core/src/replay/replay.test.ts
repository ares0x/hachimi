// packages/core/src/replay/replay.test.ts
//
// P1.4 Replay 基准：
// - 事件流 → 轨迹投影（工具配对、文件改动、用量聚合）
// - ReplayExpect 评估（必需工具/禁止行为/Jaccard/错误数）
// - 基线保存与回归检测
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "../types/event.js";
import { findRegressions, loadBaseline, saveBaseline } from "./baseline.js";
import { evaluateTrajectory, jaccard } from "./runner.js";
import { recordTrajectoryFromEvents } from "./trajectory.js";

function makeEvents(): RuntimeEvent[] {
  const base = { sessionId: "sess_1", timestamp: "2026-08-07T00:00:00.000Z" };
  return [
    { ...base, id: "e1", type: "user_message", payload: { content: "帮我改一下 README" } },
    {
      ...base,
      id: "e2",
      type: "tool_call",
      payload: { toolCallId: "call_1", toolName: "read_file", args: { path: "README.md" } },
    },
    {
      ...base,
      id: "e3",
      type: "tool_result",
      payload: { toolCallId: "call_1", toolName: "read_file", result: "# Title", isError: false },
    },
    {
      ...base,
      id: "e4",
      type: "tool_call",
      payload: {
        toolCallId: "call_2",
        toolName: "replace_file_content",
        args: { path: "README.md" },
      },
    },
    {
      ...base,
      id: "e5",
      type: "tool_result",
      payload: {
        toolCallId: "call_2",
        toolName: "replace_file_content",
        result: "done",
        isError: false,
      },
    },
    {
      ...base,
      id: "e6",
      type: "run_finished",
      payload: {
        runId: "run_1",
        durationMs: 1500,
        success: true,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 150,
          costUsd: 0.001,
        },
      },
    },
  ];
}

describe("P1.4 replay benchmark", () => {
  it("projects events into a trajectory (tools paired, files, usage)", () => {
    const t = recordTrajectoryFromEvents("sess_1", makeEvents());
    expect(t.prompt).toContain("README");
    expect(t.toolCalls).toHaveLength(2);
    expect(t.toolCalls[0].result).toContain("# Title");
    expect(t.changedFiles).toEqual(["README.md"]);
    expect(t.errorEvents).toBe(0);
    expect(t.durationMs).toBe(1500);
    expect(t.totalTokens).toBe(150);
    expect(t.costUsd).toBe(0.001);
  });

  it("counts error events and failed tool results", () => {
    const events = makeEvents();
    events.push({
      sessionId: "sess_1",
      id: "e7",
      timestamp: "2026-08-07T00:00:00.000Z",
      type: "error",
      payload: { message: "boom", phase: "agent.run" },
    });
    const t = recordTrajectoryFromEvents("sess_1", events);
    expect(t.errorEvents).toBe(1);
  });

  it("evaluates requiredTools / forbiddenBehaviors / jaccard", () => {
    const t = recordTrajectoryFromEvents("sess_1", makeEvents());
    const verdict = evaluateTrajectory("file-editing", "文件编辑", t, {
      requiredTools: ["read_file", "replace_file_content"],
      forbiddenBehaviors: [{ tool: "run_command" }],
      expectedChangedFiles: ["README.md"],
      maxErrorEvents: 2,
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(1);
  });

  it("fails when required tools missing or forbidden behavior triggered", () => {
    const t = recordTrajectoryFromEvents("sess_1", makeEvents());
    t.toolCalls.push({
      name: "run_command",
      args: { command: "rm -rf /" },
      result: "denied",
      isError: false,
    });
    const verdict = evaluateTrajectory("safety", "安全", t, {
      requiredTools: ["browser_navigate"],
      forbiddenBehaviors: [{ tool: "run_command" }],
    });
    expect(verdict.passed).toBe(false);
    const names = verdict.checks.map((c) => c.name);
    expect(names).toContain("requiredTools");
    expect(names).toContain("forbiddenBehaviors");
  });

  it("jaccard similarity math", () => {
    expect(jaccard(["a", "b"], ["a", "b", "c"])).toBeCloseTo(2 / 3);
    expect(jaccard([], [])).toBe(1);
    expect(jaccard(["a"], [])).toBe(0);
  });

  it("baseline save/load and regression detection", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-eval-"));
    try {
      const verdicts = [
        evaluateTrajectory("s1", "s1", recordTrajectoryFromEvents("sess_1", makeEvents()), {
          requiredTools: ["read_file"],
        }),
      ];
      const file = saveBaseline(dir, verdicts);
      expect(loadBaseline(dir)?.suites).toHaveLength(1);

      // 无回归：当前仍通过
      expect(findRegressions(loadBaseline(dir), verdicts)).toEqual([]);

      // 回归：基线通过、当前失败
      const failing = evaluateTrajectory("s1", "s1", recordTrajectoryFromEvents("sess_1", []), {
        requiredTools: ["read_file"],
      });
      expect(failing.passed).toBe(false);
      expect(findRegressions(loadBaseline(dir), [failing])).toEqual(["s1"]);
      void file;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
