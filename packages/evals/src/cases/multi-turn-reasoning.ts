// packages/evals/src/cases/multi-turn-reasoning.ts
import type { EvalCase } from "../types.js";

export const multiTurnReasoningCases: EvalCase[] = [
  {
    id: "reasoning_01",
    name: "Multi-turn Multi-step Problem Solving",
    category: "multi_turn_reasoning",
    description: "Verifies multi-step tool calls and reasoning trajectory.",
    prompt: "请帮我计算 30 * 3",
    history: [
      { role: "user", content: "你能帮我进行复杂多步计算吗？" },
      { role: "assistant", content: "当然可以，请告诉我你需要计算的算式。" },
    ],
    expectation: {
      containsText: ["90"],
    },
  },
];
