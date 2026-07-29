// packages/evals/src/types.ts

export type EvalCategory =
  | "tool_calling"
  | "multi_turn_reasoning"
  | "memory_retrieval"
  | "subagent_delegation"
  | "safety_jail"
  | "work_recovery"
  | "permission_deny"
  | "plan_then_act";

export interface EvalToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

export interface EvalTrajectory {
  inputPrompt: string;
  outputContent: string;
  toolCalls: EvalToolCallInfo[];
  durationMs: number;
  tokenCount: number;
  isError: boolean;
  sessionId: string;
}

export interface EvalExpectation {
  containsText?: string[];
  notContainsText?: string[];
  patternRegex?: RegExp[];
  expectedToolCalls?: Array<{
    name: string;
    argsMatch?: Record<string, unknown>;
  }>;
  expectedMemoryContent?: string;
  expectedFileModified?: {
    path: string;
    contains?: string;
  };
  llmJudgeRubric?: string;
}

export interface EvalCase {
  id: string;
  name: string;
  category: EvalCategory;
  description: string;
  prompt: string;
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  memoriesSetup?: Array<{
    layer: "working" | "session" | "long_term" | "archival";
    content: string;
  }>;
  expectation: EvalExpectation;
}

export interface EvalResult {
  caseId: string;
  caseName: string;
  category: EvalCategory;
  passed: boolean;
  score: number; // 0.0 to 1.0
  reason: string;
  metrics: {
    durationMs: number;
    tokenCount: number;
    toolCallCount: number;
  };
}

export interface CategorySummary {
  total: number;
  passed: number;
  passRate: number;
  avgLatencyMs: number;
  avgTokens: number;
}

export interface EvalSuiteResult {
  totalCases: number;
  passedCases: number;
  passRate: number;
  categoryResults: Record<EvalCategory, CategorySummary>;
  results: EvalResult[];
  durationMs: number;
}

export interface EvalGrader {
  grade(trajectory: EvalTrajectory, expectation: EvalExpectation): Promise<EvalResult>;
}
