// packages/evals/src/cases/memory-retrieval.ts
import type { EvalCase } from "../types.js";

export const memoryRetrievalCases: EvalCase[] = [
  {
    id: "memory_01",
    name: "User Preference Memory Retrieval",
    category: "memory_retrieval",
    description:
      "Verifies that long-term memory facts are retrieved and incorporated into response.",
    prompt: "你喜欢喝什么咖啡？",
    memoriesSetup: [
      {
        layer: "long_term",
        content: "根据记忆，你喜欢喝手冲咖啡。",
      },
    ],
    expectation: {
      containsText: ["手冲咖啡"],
    },
  },
];
