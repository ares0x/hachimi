import { describe, expect, it } from "vitest";
import { isTurnFinalAnswer, type TimelineStepLike } from "./activity-utils.js";

function step(id: string, type: string, role?: "user" | "assistant" | "system"): TimelineStepLike {
  return { id, type, ...(role ? { role } : {}) };
}

describe("isTurnFinalAnswer", () => {
  it("marks a lone assistant answer as final", () => {
    const items = [step("u1", "message", "user"), step("a1", "message", "assistant")];
    expect(isTurnFinalAnswer(items, 1)).toBe(true);
  });

  it("marks narration followed by tool activity as intermediate", () => {
    const items = [
      step("u1", "message", "user"),
      step("a1", "message", "assistant"),
      step("t1", "tool"),
      step("a2", "message", "assistant"),
    ];
    expect(isTurnFinalAnswer(items, 1)).toBe(false);
    expect(isTurnFinalAnswer(items, 3)).toBe(true);
  });

  it("marks narration followed by thinking activity as intermediate", () => {
    const items = [
      step("u1", "message", "user"),
      step("a1", "message", "assistant"),
      step("th1", "thinking"),
      step("a2", "message", "assistant"),
    ];
    expect(isTurnFinalAnswer(items, 1)).toBe(false);
    expect(isTurnFinalAnswer(items, 3)).toBe(true);
  });

  it("handles consecutive assistant messages (only the last is final)", () => {
    const items = [
      step("u1", "message", "user"),
      step("a1", "message", "assistant"),
      step("a2", "message", "assistant"),
    ];
    expect(isTurnFinalAnswer(items, 1)).toBe(false);
    expect(isTurnFinalAnswer(items, 2)).toBe(true);
  });

  it("keeps an answer final when only system/steer events follow", () => {
    const items = [
      step("u1", "message", "user"),
      step("a1", "message", "assistant"),
      step("s1", "system"),
      step("u2", "message", "user"),
      step("a2", "message", "assistant"),
    ];
    expect(isTurnFinalAnswer(items, 1)).toBe(true);
    expect(isTurnFinalAnswer(items, 4)).toBe(true);
  });

  it("rejects non-message and user steps", () => {
    const items = [step("u1", "message", "user"), step("t1", "tool")];
    expect(isTurnFinalAnswer(items, 0)).toBe(false);
    expect(isTurnFinalAnswer(items, 1)).toBe(false);
    expect(isTurnFinalAnswer([], 0)).toBe(false);
  });
});
