// packages/evals/src/reporter.ts
import type { EvalSuiteResult } from "./types.js";

export class EvalReporter {
  static formatConsoleTable(suiteResult: EvalSuiteResult, provider = "mock"): string {
    const lines: string[] = [];

    lines.push(
      "==================================================================================================="
    );
    lines.push(`📊 HACHIMI AGENT EVALUATION REPORT (Provider: ${provider})`);
    lines.push(
      "==================================================================================================="
    );
    lines.push(
      "Category               Total    Passed    Pass Rate (%)    Avg Latency    Avg Tokens"
    );
    lines.push(
      "---------------------------------------------------------------------------------------------------"
    );

    for (const [cat, summary] of Object.entries(suiteResult.categoryResults)) {
      const catPad = cat.padEnd(20, " ");
      const totalPad = String(summary.total).padEnd(8, " ");
      const passedPad = String(summary.passed).padEnd(9, " ");
      const passRatePad = `${summary.passRate.toFixed(1)}%`.padEnd(16, " ");
      const latencyPad = `${summary.avgLatencyMs}ms`.padEnd(14, " ");
      const tokensPad = String(summary.avgTokens);

      lines.push(`${catPad} ${totalPad} ${passedPad} ${passRatePad} ${latencyPad} ${tokensPad}`);
    }

    lines.push(
      "---------------------------------------------------------------------------------------------------"
    );
    const overallPass = `${suiteResult.passedCases}/${suiteResult.totalCases}`;
    const overallRate = `${suiteResult.passRate.toFixed(1)}%`;
    lines.push(
      `OVERALL SUMMARY        Total Passed: ${overallPass} | Pass Rate: ${overallRate} | Duration: ${suiteResult.durationMs}ms`
    );
    lines.push(
      "==================================================================================================="
    );

    return lines.join("\n");
  }
}
