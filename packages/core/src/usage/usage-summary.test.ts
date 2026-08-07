import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "../types/event.js";
import { buildUsageSummary, collectRunUsage } from "./usage-summary.js";

function ev(
  type: RuntimeEvent["type"],
  payload: Record<string, unknown>,
  ts = "2026-08-06T10:00:00.000Z",
  sessionId = "sess_test"
): RuntimeEvent {
  return {
    id: `ev_${type}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    timestamp: ts,
    type,
    payload,
  } as RuntimeEvent;
}

const NOW = new Date("2026-08-06T12:00:00.000Z");

describe("collectRunUsage", () => {
  it("extracts run_finished records with usage and model", () => {
    const events = [
      ev("run_finished", {
        durationMs: 5,
        success: true,
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 120,
          costUsd: 0.01,
        },
        model: "deepseek-v4-flash",
      }),
      ev("error", { message: "boom" }),
      ev("tool_call", { toolCallId: "c1", toolName: "read_file", args: {} }),
    ];
    const records = collectRunUsage(events);
    expect(records).toHaveLength(2);
    expect(records[0].success).toBe(true);
    expect(records[0].model).toBe("deepseek-v4-flash");
    expect(records[1].success).toBe(false);
  });
});

describe("buildUsageSummary", () => {
  it("aggregates tokens, cost, tools, and models per window", () => {
    const events: RuntimeEvent[] = [
      ev("run_finished", {
        durationMs: 10,
        success: true,
        usage: {
          inputTokens: 1000,
          outputTokens: 200,
          cacheReadTokens: 50,
          cacheWriteTokens: 10,
          totalTokens: 1260,
          costUsd: 0.001,
        },
        model: "deepseek-v4-flash",
      }),
      ev("run_finished", {
        durationMs: 10,
        success: true,
        usage: {
          inputTokens: 4000,
          outputTokens: 1000,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 5000,
          costUsd: 0.05,
        },
        model: "gpt-4o",
      }),
      ev("tool_call", { toolCallId: "c1", toolName: "run_command", args: {} }),
      ev("tool_call", { toolCallId: "c2", toolName: "read_file", args: {} }),
      ev("tool_call", { toolCallId: "c3", toolName: "run_command", args: {} }),
    ];
    const summary = buildUsageSummary(events, { days: 7, now: NOW });
    expect(summary.runs).toBe(2);
    expect(summary.failedRuns).toBe(0);
    expect(summary.sessions).toBe(1);
    expect(summary.tokens.inputTokens).toBe(5000);
    expect(summary.tokens.outputTokens).toBe(1200);
    expect(summary.tokens.totalTokens).toBe(6260);
    expect(summary.costUsd).toBeCloseTo(0.051, 6);
    expect(summary.topTools.map((t) => t.name)).toEqual(["run_command", "read_file"]);
    expect(summary.topModels[0].model).toBe("gpt-4o");
    expect(summary.bySession[0].toolCalls).toBe(3);
  });

  it("counts error events as failed runs", () => {
    const events = [
      ev("run_finished", { durationMs: 5, success: false }),
      ev("error", { message: "boom" }),
    ];
    const summary = buildUsageSummary(events, { days: 7, now: NOW });
    expect(summary.runs).toBe(2);
    expect(summary.failedRuns).toBe(2);
  });

  it("filters events outside the rolling window", () => {
    const old = ev(
      "run_finished",
      {
        durationMs: 5,
        success: true,
        usage: {
          inputTokens: 9999,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 9999,
        },
      },
      "2026-07-01T00:00:00.000Z"
    );
    const fresh = ev(
      "run_finished",
      {
        durationMs: 5,
        success: true,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 15,
        },
      },
      "2026-08-05T00:00:00.000Z"
    );
    const summary = buildUsageSummary([old, fresh], { days: 7, now: NOW });
    expect(summary.runs).toBe(1);
    expect(summary.tokens.totalTokens).toBe(15);
  });

  it("handles days=0 as all history", () => {
    const old = ev(
      "run_finished",
      {
        durationMs: 5,
        success: true,
        usage: {
          inputTokens: 9999,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 9999,
        },
      },
      "2026-01-01T00:00:00.000Z"
    );
    const summary = buildUsageSummary([old], { days: 0, now: NOW });
    expect(summary.runs).toBe(1);
  });

  it("aggregates per session separately", () => {
    const events = [
      ev(
        "run_finished",
        {
          durationMs: 5,
          success: true,
          usage: {
            inputTokens: 100,
            outputTokens: 10,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 110,
          },
        },
        "2026-08-05T00:00:00.000Z",
        "sess_a"
      ),
      ev(
        "run_finished",
        {
          durationMs: 5,
          success: true,
          usage: {
            inputTokens: 50,
            outputTokens: 5,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 55,
          },
        },
        "2026-08-05T00:00:00.000Z",
        "sess_b"
      ),
    ];
    const summary = buildUsageSummary(events, { days: 7, now: NOW });
    expect(summary.sessions).toBe(2);
    expect(summary.bySession).toHaveLength(2);
    expect(summary.bySession[0].sessionId).toBe("sess_a");
  });
});
