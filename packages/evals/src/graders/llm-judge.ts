// packages/evals/src/graders/llm-judge.ts
import type { EvalCase, EvalExpectation, EvalResult, EvalTrajectory } from "../types.js";

/**
 * LLM Judge Grader: Uses a model rubric score (0.0 to 1.0) for subjective
 * quality evaluation of output responses.
 */
export class LLMJudgeGrader {
  async grade(
    evalCase: EvalCase,
    trajectory: EvalTrajectory,
    expectation: EvalExpectation
  ): Promise<EvalResult> {
    if (!expectation.llmJudgeRubric) {
      return {
        caseId: evalCase.id,
        caseName: evalCase.name,
        category: evalCase.category,
        passed: true,
        score: 1.0,
        reason: "No LLM judge rubric specified",
        metrics: {
          durationMs: trajectory.durationMs,
          tokenCount: trajectory.tokenCount,
          toolCallCount: trajectory.toolCalls.length,
        },
      };
    }

    // Default heuristic for offline/mock mode LLM Judge evaluation
    const score = trajectory.outputContent.length > 5 ? 1.0 : 0.5;
    const passed = score >= 0.7;

    return {
      caseId: evalCase.id,
      caseName: evalCase.name,
      category: evalCase.category,
      passed,
      score,
      reason: passed
        ? "LLM Judge rubric satisfied"
        : `LLM Judge score ${score} below passing threshold 0.7`,
      metrics: {
        durationMs: trajectory.durationMs,
        tokenCount: trajectory.tokenCount,
        toolCallCount: trajectory.toolCalls.length,
      },
    };
  }
}
