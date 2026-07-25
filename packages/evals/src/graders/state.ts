// packages/evals/src/graders/state.ts
import { existsSync, readFileSync } from "node:fs";
import type { HarnessRuntime } from "@hachimi/core";
import type { EvalCase, EvalExpectation, EvalResult, EvalTrajectory } from "../types.js";

/**
 * State Grader: Evaluates environment side-effects such as memory persistence
 * and file modifications in the workspace.
 */
export class StateGrader {
  async grade(
    evalCase: EvalCase,
    trajectory: EvalTrajectory,
    expectation: EvalExpectation,
    runtime?: HarnessRuntime
  ): Promise<EvalResult> {
    const reasons: string[] = [];
    let passed = true;

    // 1. Expected Memory Persistence
    if (expectation.expectedMemoryContent && runtime) {
      const memories = await runtime.memory.search(expectation.expectedMemoryContent);
      const found = memories.some((m) => m.content.includes(expectation.expectedMemoryContent!));
      if (!found) {
        passed = false;
        reasons.push(
          `Memory persistence assertion failed: missing expected memory containing "${expectation.expectedMemoryContent}"`
        );
      }
    }

    // 2. Expected File Modification
    if (expectation.expectedFileModified) {
      const { path: filePath, contains } = expectation.expectedFileModified;
      if (!existsSync(filePath)) {
        passed = false;
        reasons.push(`File assertion failed: file does not exist at "${filePath}"`);
      } else if (contains) {
        const fileContent = readFileSync(filePath, "utf-8");
        if (!fileContent.includes(contains)) {
          passed = false;
          reasons.push(
            `File assertion failed: file at "${filePath}" does not contain expected text "${contains}"`
          );
        }
      }
    }

    return {
      caseId: evalCase.id,
      caseName: evalCase.name,
      category: evalCase.category,
      passed,
      score: passed ? 1.0 : 0.0,
      reason: passed ? "State assertion passed" : reasons.join("; "),
      metrics: {
        durationMs: trajectory.durationMs,
        tokenCount: trajectory.tokenCount,
        toolCallCount: trajectory.toolCalls.length,
      },
    };
  }
}
