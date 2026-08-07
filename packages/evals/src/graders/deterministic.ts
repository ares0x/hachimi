// packages/evals/src/graders/deterministic.ts
import type { EvalCase, EvalExpectation, EvalResult, EvalTrajectory } from "../types.js";

/**
 * Deterministic Grader: Evaluates output text matching, regex patterns,
 * forbidden text, and expected tool call invocations.
 */
export class DeterministicGrader {
  async grade(
    evalCase: EvalCase,
    trajectory: EvalTrajectory,
    expectation: EvalExpectation
  ): Promise<EvalResult> {
    const reasons: string[] = [];
    let passed = true;

    // 1. Text inclusion check
    if (expectation.containsText) {
      for (const text of expectation.containsText) {
        if (!trajectory.outputContent.includes(text)) {
          passed = false;
          reasons.push(`Output missing expected substring: "${text}"`);
        }
      }
    }

    // 2. Text exclusion check
    if (expectation.notContainsText) {
      for (const text of expectation.notContainsText) {
        if (trajectory.outputContent.includes(text)) {
          passed = false;
          reasons.push(`Output contained forbidden substring: "${text}"`);
        }
      }
    }

    // 3. Regex pattern check
    if (expectation.patternRegex) {
      for (const pattern of expectation.patternRegex) {
        if (!pattern.test(trajectory.outputContent)) {
          passed = false;
          reasons.push(`Output did not match expected regex: ${pattern.toString()}`);
        }
      }
    }

    // 4. Expected tool calls check
    if (expectation.expectedToolCalls) {
      for (const expectedTool of expectation.expectedToolCalls) {
        const matchingCall = trajectory.toolCalls.find((c) => c.name === expectedTool.name);
        if (!matchingCall) {
          passed = false;
          reasons.push(`Expected tool "${expectedTool.name}" was not invoked`);
        } else if (expectedTool.argsMatch) {
          for (const [key, val] of Object.entries(expectedTool.argsMatch)) {
            if (matchingCall.args[key] !== val) {
              passed = false;
              reasons.push(
                `Tool "${expectedTool.name}" parameter [${key}] mismatch. Expected: ${JSON.stringify(
                  val
                )}, Got: ${JSON.stringify(matchingCall.args[key])}`
              );
            }
          }
        }
      }
    }

    return {
      caseId: evalCase.id,
      caseName: evalCase.name,
      category: evalCase.category,
      passed,
      score: passed ? 1.0 : 0.0,
      reason: passed ? "All deterministic assertions passed" : reasons.join("; "),
      metrics: {
        durationMs: trajectory.durationMs,
        tokenCount: trajectory.tokenCount,
        toolCallCount: trajectory.toolCalls.length,
      },
    };
  }
}
