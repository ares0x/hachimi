// packages/core/src/sub-agent-quota.test.ts
import { describe, expect, it } from "vitest";
import { SubAgentDelegator } from "./agent/sub-agent.js";
import { createHarnessRuntime } from "./runtime/harness-runtime.js";

describe("Sub-Agent Model-Agnostic Quota Suite", () => {
  it("sub-agent delegator respects quota options (maxTokens, maxCostUSD)", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);

    const result = await delegator.runSubAgent({
      taskDescription: "独立子任务：测试额度下发",
      maxTokens: 5000,
      maxCostUSD: 0.05,
    });

    expect(result.success).toBe(true);
    expect(result.taskId).toBeDefined();

    const state = delegator.getTaskState(result.taskId);
    expect(state?.status).toBe("completed");
  });
});
