// packages/evals/src/evals.test.ts
import { describe, expect, it } from "vitest";
import { EvalReporter } from "./reporter.js";
import { EvalRunner } from "./runner.js";

describe("Phase I — Agent Capability Evaluation Framework (Evals)", () => {
  it("runs full evaluation benchmark suite in mock mode with 100% pass rate", async () => {
    const runner = new EvalRunner({ providerOverride: "mock" });
    const suiteResult = await runner.runSuite();

    expect(suiteResult.totalCases).toBeGreaterThanOrEqual(5);
    expect(suiteResult.passedCases).toBe(suiteResult.totalCases);
    expect(suiteResult.passRate).toBe(100);

    const formattedReport = EvalReporter.formatConsoleTable(suiteResult);
    expect(formattedReport).toContain("HACHIMI AGENT EVALUATION REPORT");
    expect(formattedReport).toContain("tool_calling");
    expect(formattedReport).toContain("multi_turn_reasoning");
    expect(formattedReport).toContain("memory_retrieval");
    expect(formattedReport).toContain("subagent_delegation");
    expect(formattedReport).toContain("safety_jail");
    expect(formattedReport).toContain("work_recovery");
    expect(formattedReport).toContain("permission_deny");
    expect(formattedReport).toContain("plan_then_act");
  }, 15_000);
});
