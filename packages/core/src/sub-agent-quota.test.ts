// packages/core/src/sub-agent-quota.test.ts
import { describe, expect, it } from "vitest";
import { SubAgentDelegator } from "./agent/sub-agent.js";
import { createHarnessRuntime } from "./runtime/harness-runtime.js";

/**
 * H3.5: 子 Agent 派生预算（maxTokens / maxCostUSD）必须真实生效：
 * MockLLMProvider 每次 LLM 调用上报 totalTokens=150、costUsd=0.0001，
 * 因此极小的预算会在第一轮调用后触发「预算用尽，优雅收尾」。
 * （此前该测试只断言 success=true，配额逻辑被删也不会红。）
 */
describe("Sub-Agent Model-Agnostic Quota Suite", () => {
  it("enforces maxTokens budget and returns a graceful partial summary", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);

    const result = await delegator.runSubAgent({
      taskDescription: "独立子任务：测试 Token 额度下发",
      maxTokens: 10, // mock 单次调用即 150 tokens，必然超限
    });

    expect(result.success).toBe(true);
    expect(result.taskId).toBeDefined();
    expect(result.summary).toMatch(/预算用尽|Budget Exhausted/);

    const state = delegator.getTaskState(result.taskId);
    expect(state?.status).toBe("completed");
    expect(state?.summary).toMatch(/预算用尽|Budget Exhausted/);
  });

  it("enforces maxCostUSD budget and returns a graceful partial summary", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);

    const result = await delegator.runSubAgent({
      taskDescription: "独立子任务：测试费用额度下发",
      maxCostUSD: 0.00001, // mock 单次调用 costUsd=0.0001，必然超限
    });

    expect(result.success).toBe(true);
    expect(result.summary).toMatch(/预算用尽|Budget Exhausted/);
  });

  it("without budget the sub-agent completes normally (no budget message)", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);

    const result = await delegator.runSubAgent({
      taskDescription: "独立子任务：无预算限制的正常执行",
    });

    expect(result.success).toBe(true);
    expect(result.summary).not.toMatch(/预算用尽|Budget Exhausted/);
  });
});
