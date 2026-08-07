// packages/ui/src/lib/activity-utils.ts

/** Minimal structural view of a timeline step — enough to decide answer finality. */
export interface TimelineStepLike {
  id: string;
  type: string;
  role?: "user" | "assistant" | "system";
}

/**
 * Decide whether the step at `index` is the FINAL answer of its turn.
 *
 * A turn is the span between user messages. Assistant messages that are emitted
 * alongside tool calls (intermediate narrations like "我来帮你查一下…") are followed
 * by tool/thinking/approval activities — they are process noise, not answers, and
 * must NOT get copy/regenerate actions.
 *
 * Rules:
 * - only `type: "message"` + `role: "assistant"` steps can be final
 * - any later tool/thinking/approval activity within the same turn ⇒ intermediate
 * - otherwise final iff it is the last assistant message of the turn
 */
export function isTurnFinalAnswer(steps: readonly TimelineStepLike[], index: number): boolean {
  const step = steps[index];
  if (!step || step.type !== "message" || step.role !== "assistant") return false;

  for (let i = index + 1; i < steps.length; i++) {
    const s = steps[i];
    if (s.type === "message" && s.role === "user") break; // next turn starts
    if (s.type === "tool" || s.type === "thinking" || s.type === "approval") {
      return false; // narration emitted alongside tool work — not the final answer
    }
  }

  for (let i = index + 1; i < steps.length; i++) {
    const s = steps[i];
    if (s.type === "message" && s.role === "user") break;
    if (s.type === "message" && s.role === "assistant") return false; // a later answer exists
  }

  return true;
}
