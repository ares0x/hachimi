// packages/core/src/agent/sub-agent.test.ts
import { describe, expect, it } from "vitest";
import { createHarnessRuntime } from "../runtime/harness-runtime.js";
import {
  DEFAULT_SUBAGENT_BUDGET_TOKENS,
  defaultSubAgentBudgetTokens,
  SubAgentDelegator,
} from "./sub-agent.js";

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
    // P2: 派发子代理消耗父会话额度，入口升级为需确认
    expect(tool.permission).toBe("needs_confirm");
    // P2.8: 嵌套 run 覆盖沙箱默认 30s 超时（同步派发一次真实调研远超 30s）
    expect(tool.timeoutMs).toBe(600_000);
    // P2: 工具面公布 subagentType 角色参数
    const params = tool.parameters as {
      properties?: { subagentType?: { enum?: string[] } };
    };
    expect(params.properties?.subagentType?.enum).toEqual([
      "general-purpose",
      "explore",
      "plan",
      "reviewer",
    ]);

    const execResult = await tool.execute({
      taskDescription: "评估依赖包安全性",
    });

    expect(execResult).toMatch(/\[(子 Agent 运行完成|Sub-agent Completed)/);
  });

  it("agent_output waits up to 10 minutes to survive the sandbox timeout (P2.9)", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);
    const tool = delegator.getOutputTool();

    expect(tool.name).toBe("agent_output");
    expect(tool.timeoutMs).toBe(600_000);
  });

  it("defaults sub-agent budget to 3x the parent context window when maxTokens omitted (P1)", () => {
    // 父窗口已知 → 3 倍余量（调研多轮累计 usage 远超单窗口）
    expect(defaultSubAgentBudgetTokens(16000)).toBe(48000);
    expect(defaultSubAgentBudgetTokens(32000)).toBe(96000);
    // 封顶：128k 窗口 ×3 = 384k → clamp 到 128k（防失控）
    expect(defaultSubAgentBudgetTokens(128000)).toBe(128000);
    expect(defaultSubAgentBudgetTokens(8000)).toBe(DEFAULT_SUBAGENT_BUDGET_TOKENS);
    // 父窗口未知（直接调用 runSubAgent / 未配置）→ 兜底
    expect(defaultSubAgentBudgetTokens(undefined)).toBe(DEFAULT_SUBAGENT_BUDGET_TOKENS);
    expect(defaultSubAgentBudgetTokens(0)).toBe(DEFAULT_SUBAGENT_BUDGET_TOKENS);
  });

  it("defaults sub-agent reasoning effort to none and forwards explicit value (P2-3)", async () => {
    const calls: Array<{ options?: { reasoningEffort?: string } }> = [];
    const fakeRuntime = {
      execute: async (opts: { options?: { reasoningEffort?: string } }) => {
        calls.push(opts);
        return { content: "done", isError: false };
      },
      events: { append: async () => {} },
      works: { get: () => undefined },
    };
    const delegator = new SubAgentDelegator(fakeRuntime as never);

    await delegator.runSubAgent({ taskDescription: "默认关思考" });
    expect(calls[0]?.options?.reasoningEffort).toBe("none");

    await delegator.runSubAgent({ taskDescription: "显式高思考", reasoningEffort: "high" });
    expect(calls[1]?.options?.reasoningEffort).toBe("high");
  });

  it("classifies a sync sub-agent run as cancelled when the parent signal aborts mid-run", async () => {
    const controller = new AbortController();
    const fakeRuntime = {
      execute: async (opts: { signal?: AbortSignal }) => {
        await new Promise((res) => setTimeout(res, 20));
        if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
        return { content: "done", isError: false };
      },
      events: { append: async () => {} },
      works: { get: () => undefined },
    };
    const delegator = new SubAgentDelegator(fakeRuntime as never);

    const runPromise = delegator.runSubAgent({
      taskDescription: "长任务调研",
      parentSessionId: "work_parent_1",
      parentSignal: controller.signal,
    });
    setTimeout(() => controller.abort(), 5);

    const result = await runPromise;
    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/已取消/);
    expect(delegator.getTaskState(result.taskId)?.status).toBe("cancelled");
  });

  it("waitForTasks waits for async sub-agents to complete (mode=all)", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);

    const a = await delegator.runSubAgent({
      taskDescription: "任务A",
      async: true,
      parentSessionId: "work_wait",
    });
    const b = await delegator.runSubAgent({
      taskDescription: "任务B",
      async: true,
      parentSessionId: "work_wait",
    });

    const states = await delegator.waitForTasks([a.taskId, b.taskId], "all", 10000);
    expect(states.length).toBe(2);
    expect(states.every((s) => s.status === "completed")).toBe(true);
  });

  it("waitForTasks mode=any returns on first completion", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);

    const a = await delegator.runSubAgent({
      taskDescription: "任务A",
      async: true,
      parentSessionId: "work_wait",
    });
    const b = await delegator.runSubAgent({
      taskDescription: "任务B",
      async: true,
      parentSessionId: "work_wait",
    });

    const states = await delegator.waitForTasks([a.taskId, b.taskId], "any", 10000);
    expect(states.length).toBeGreaterThanOrEqual(1);
    expect(states[0].status).toBe("completed");
  });

  it("waitForTasks returns running states when timeout elapses, then completes", async () => {
    let release: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fakeRuntime = {
      execute: async () => {
        await gate;
        return { content: "done", isError: false };
      },
      events: { append: async () => {} },
      works: { get: () => undefined },
    };
    const delegator = new SubAgentDelegator(fakeRuntime as never);

    const r = await delegator.runSubAgent({
      taskDescription: "慢任务",
      async: true,
      parentSessionId: "work_wait",
    });
    const running = await delegator.waitForTasks([r.taskId], "all", 50);
    expect(running[0]?.status).toBe("running");

    release!();
    const done = await delegator.waitForTasks([r.taskId], "all", 10000);
    expect(done[0]?.status).toBe("completed");
  });

  it("waitForTasks ignores unknown ids without hanging", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);

    const states = await delegator.waitForTasks(["task_sub_nonexistent"], "all", 100);
    expect(states).toEqual([]);
  });
});
