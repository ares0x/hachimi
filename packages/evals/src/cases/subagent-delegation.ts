// packages/evals/src/cases/subagent-delegation.ts
import type { EvalCase } from "../types.js";

export const subagentDelegationCases: EvalCase[] = [
  {
    id: "subagent_01",
    name: "Sub-Agent Isolation Delegation for Heavy Research",
    category: "subagent_delegation",
    description: "Verifies that complex technical tasks trigger sub-agent delegation tool.",
    prompt: "调用工具 delegate_subagent 评估依赖包安全性",
    expectation: {
      expectedToolCalls: [
        {
          name: "delegate_subagent",
        },
      ],
    },
  },
];
