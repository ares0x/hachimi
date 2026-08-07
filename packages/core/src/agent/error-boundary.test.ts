// packages/core/src/agent/error-boundary.test.ts
import { describe, expect, it } from "vitest";
import { createHarnessRuntime } from "../runtime/harness-runtime.js";

describe("H1.5 HarnessRuntime Error Boundary Suite", () => {
  it("gracefully catches provider LLM failures and returns readable error message", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });

    // Mock LLM 模拟强制抛错
    runtime.context.agent["llm"].chat = async () => {
      throw new Error("LLM API 401 Unauthorized / Network Timeout");
    };

    const output = await runtime.execute({
      prompt: "这条请求会导致 LLM 抛错",
      channel: "api-test",
    });

    expect(output.isError).toBe(true);
    expect(output.errorDetail).toContain("401 Unauthorized");
    expect(output.content).toMatch(/\[Agent (运行故障|Runtime Error)\]/);
  });
});
