// packages/core/src/agent/sub-agent.test.ts
import { describe, expect, it } from "vitest";
import { createHarnessRuntime } from "../runtime/harness-runtime.js";
import { SubAgentDelegator } from "./sub-agent.js";

describe("F4 SubAgent Delegation Suite", () => {
  it("spawns isolated sub-agent and returns summary result", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);

    const result = await delegator.runSubAgent({
      taskDescription: "对比方案 A 与方案 B 的性能优点",
      contextHint: "方案 A 基于内存缓存，方案 B 基于磁盘存储",
    });

    expect(result.success).toBe(true);
    expect(result.subSessionId).toContain("sub_sess_");
    expect(result.summary).toBeDefined();
  });

  it("generates delegate_subagent tool definition for parent LLM tool calling", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);
    const tool = delegator.getDelegationTool();

    expect(tool.name).toBe("delegate_subagent");
    expect(tool.permission).toBe("safe");

    const execResult = await tool.execute({
      taskDescription: "评估依赖包安全性",
    });

    expect(execResult).toMatch(/\[(子 Agent 运行完成|Sub-agent Completed)/);
  });
});
