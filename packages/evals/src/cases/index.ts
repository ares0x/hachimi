// packages/evals/src/cases/index.ts
import type { EvalCase } from "../types.js";
import { memoryRetrievalCases } from "./memory-retrieval.js";
import { multiTurnReasoningCases } from "./multi-turn-reasoning.js";
import { safetyJailCases } from "./safety-jail.js";
import { subagentDelegationCases } from "./subagent-delegation.js";
import { toolCallingCases } from "./tool-calling.js";

export * from "./memory-retrieval.js";
export * from "./multi-turn-reasoning.js";
export * from "./safety-jail.js";
export * from "./subagent-delegation.js";
export * from "./tool-calling.js";

export const allEvalCases: EvalCase[] = [
  ...toolCallingCases,
  ...multiTurnReasoningCases,
  ...memoryRetrievalCases,
  ...subagentDelegationCases,
  ...safetyJailCases,
];
