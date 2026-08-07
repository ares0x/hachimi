import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "../types/event.js";
import { classifySessionInterruption, interruptionHint } from "./interruption.js";

function ev(type: RuntimeEvent["type"], payload: Record<string, unknown> = {}): RuntimeEvent {
  return {
    id: `ev_${type}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "sess_test",
    timestamp: new Date().toISOString(),
    type,
    payload,
  } as RuntimeEvent;
}

describe("classifySessionInterruption", () => {
  it("classifies an empty stream as unknown", () => {
    const r = classifySessionInterruption([]);
    expect(r.kind).toBe("unknown");
    expect(r.eventCount).toBe(0);
  });

  it("classifies a successful run as completed", () => {
    const events = [
      ev("user_message", { content: "hi" }),
      ev("assistant_message", { content: "ok" }),
      ev("run_finished", { durationMs: 5, success: true }),
    ];
    expect(classifySessionInterruption(events).kind).toBe("completed");
  });

  it("classifies a failed run as cancelled", () => {
    const events = [ev("run_finished", { durationMs: 5, success: false })];
    expect(classifySessionInterruption(events).kind).toBe("cancelled");
  });

  it("detects a stale approval wait", () => {
    const events = [
      ev("tool_call", { toolCallId: "c1", toolName: "run_command", args: {} }),
      ev("approval_requested", {
        approvalId: "a1",
        toolName: "run_command",
        args: {},
        permission: "needs_confirm",
      }),
    ];
    const r = classifySessionInterruption(events);
    expect(r.kind).toBe("waiting_approval");
    expect(r.pendingApprovalToolName).toBe("run_command");
  });

  it("detects an interrupted tool execution", () => {
    const events = [
      ev("user_message", { content: "go" }),
      ev("tool_call", { toolCallId: "c1", toolName: "write_file", args: {} }),
    ];
    const r = classifySessionInterruption(events);
    expect(r.kind).toBe("tool_interrupted");
    expect(r.pendingToolName).toBe("write_file");
  });

  it("detects a mid-stream interruption", () => {
    const events = [
      ev("user_message", { content: "go" }),
      ev("assistant_message", { content: "partial" }),
    ];
    expect(classifySessionInterruption(events).kind).toBe("stream_interrupted");
  });

  it("detects an error tail", () => {
    const events = [ev("error", { message: "boom", phase: "agent" })];
    const r = classifySessionInterruption(events);
    expect(r.kind).toBe("error");
    expect(r.lastError).toBe("boom");
  });

  it("does not flag a normal completed session as interrupted", () => {
    const events = [
      ev("user_message", { content: "hi" }),
      ev("assistant_message", { content: "bye" }),
      ev("run_finished", { durationMs: 5, success: true }),
    ];
    expect(interruptionHint(classifySessionInterruption(events))).toContain("正常完成");
  });
});
