// packages/evals/src/cases/tool-calling.ts
import type { EvalCase } from "../types.js";

export const toolCallingCases: EvalCase[] = [
  {
    id: "tool_calling_01",
    name: "Calculator Tool Invocation Accuracy",
    category: "tool_calling",
    description:
      "Verifies that the Agent accurately selects the calculator tool with correct arguments.",
    prompt: "请计算 128 + 256",
    expectation: {
      expectedToolCalls: [
        {
          name: "calculator",
          argsMatch: { a: 128, b: 256, operator: "+" },
        },
      ],
      containsText: ["384"],
    },
  },
  {
    id: "tool_calling_02",
    name: "Explicit Tool Call Dispatching Accuracy",
    category: "tool_calling",
    description: "Verifies explicit tool dispatching and tool execution loop.",
    prompt: "调用工具 calculator 辅助计算",
    expectation: {
      expectedToolCalls: [
        {
          name: "calculator",
        },
      ],
    },
  },
];
