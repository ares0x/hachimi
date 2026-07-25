// packages/evals/src/runner.ts
import { type HarnessRuntime, createHarnessRuntime } from "@hachimi/core";
import { generateId } from "@hachimi/shared";
import { allEvalCases } from "./cases/index.js";
import { DeterministicGrader, LLMJudgeGrader, StateGrader } from "./graders/index.js";
import type {
  CategorySummary,
  EvalCase,
  EvalCategory,
  EvalResult,
  EvalSuiteResult,
  EvalTrajectory,
} from "./types.js";

export interface EvalRunnerOptions {
  cases?: EvalCase[];
  runtime?: HarnessRuntime;
  providerOverride?: string;
  parallel?: boolean;
}

export class EvalRunner {
  private cases: EvalCase[];
  private runtime: HarnessRuntime;
  private deterministicGrader = new DeterministicGrader();
  private stateGrader = new StateGrader();
  private llmJudgeGrader = new LLMJudgeGrader();

  constructor(options: EvalRunnerOptions = {}) {
    this.cases = options.cases || allEvalCases;
    this.runtime =
      options.runtime ||
      createHarnessRuntime({
        providerOverride: options.providerOverride || "mock",
      });
  }

  /** Run a single eval case */
  async runCase(evalCase: EvalCase): Promise<EvalResult> {
    const sessionId = generateId("eval_sess_");
    const toolCallsRecorded: Array<{
      name: string;
      args: Record<string, unknown>;
      result?: string;
    }> = [];

    // Pre-setup session history if specified
    if (evalCase.history) {
      const session = this.runtime.sessions.getOrCreate(sessionId);
      for (const h of evalCase.history) {
        session.messages.push({
          id: generateId("msg_"),
          role: h.role,
          content: h.content,
          timestamp: Date.now(),
        });
      }
      this.runtime.sessions.save(session);
    }

    // Pre-setup memories if specified
    if (evalCase.memoriesSetup) {
      for (const m of evalCase.memoriesSetup) {
        await this.runtime.memory.add({
          layer: m.layer,
          content: m.content,
          importance: 0.9,
        });
      }
    }

    const startTime = Date.now();
    const output = await this.runtime.execute({
      prompt: evalCase.prompt,
      sessionId,
      channel: "evals",
      options: {
        onToolStart: (name: string, args: Record<string, unknown>) => {
          toolCallsRecorded.push({ name, args });
        },
        onToolEnd: (name: string, result: string) => {
          const lastCall = toolCallsRecorded
            .slice()
            .reverse()
            .find((c) => c.name === name);
          if (lastCall) {
            lastCall.result = result;
          }
        },
      },
    });

    const durationMs = Date.now() - startTime;
    const trajectory: EvalTrajectory = {
      inputPrompt: evalCase.prompt,
      outputContent: output.content,
      toolCalls: toolCallsRecorded,
      durationMs,
      tokenCount: Math.ceil(output.content.length / 2),
      isError: Boolean(output.isError),
      sessionId,
    };

    // Grade deterministic requirements
    const detRes = await this.deterministicGrader.grade(evalCase, trajectory, evalCase.expectation);
    if (!detRes.passed) {
      return detRes;
    }

    // Grade state requirements
    const stateRes = await this.stateGrader.grade(
      evalCase,
      trajectory,
      evalCase.expectation,
      this.runtime
    );
    if (!stateRes.passed) {
      return stateRes;
    }

    // Grade LLM judge requirements
    const judgeRes = await this.llmJudgeGrader.grade(evalCase, trajectory, evalCase.expectation);
    return judgeRes;
  }

  /** Run full eval suite */
  async runSuite(): Promise<EvalSuiteResult> {
    const startTime = Date.now();
    const results: EvalResult[] = [];

    for (const c of this.cases) {
      const res = await this.runCase(c);
      results.push(res);
    }

    const durationMs = Date.now() - startTime;
    const passedCases = results.filter((r) => r.passed).length;
    const totalCases = results.length;
    const passRate = totalCases > 0 ? (passedCases / totalCases) * 100 : 0;

    const categoryMap: Record<
      string,
      { total: number; passed: number; latency: number; tokens: number }
    > = {};

    for (const r of results) {
      if (!categoryMap[r.category]) {
        categoryMap[r.category] = { total: 0, passed: 0, latency: 0, tokens: 0 };
      }
      categoryMap[r.category].total += 1;
      if (r.passed) categoryMap[r.category].passed += 1;
      categoryMap[r.category].latency += r.metrics.durationMs;
      categoryMap[r.category].tokens += r.metrics.tokenCount;
    }

    const categoryResults: Record<EvalCategory, CategorySummary> = {} as any;
    for (const [cat, data] of Object.entries(categoryMap)) {
      categoryResults[cat as EvalCategory] = {
        total: data.total,
        passed: data.passed,
        passRate: data.total > 0 ? (data.passed / data.total) * 100 : 0,
        avgLatencyMs: data.total > 0 ? Math.round(data.latency / data.total) : 0,
        avgTokens: data.total > 0 ? Math.round(data.tokens / data.total) : 0,
      };
    }

    return {
      totalCases,
      passedCases,
      passRate: Number(passRate.toFixed(1)),
      categoryResults,
      results,
      durationMs,
    };
  }
}
