// packages/core/src/agent/sub-agent-async.test.ts
import { describe, expect, it } from "vitest";
import { createHarnessRuntime } from "../runtime/harness-runtime.js";
import { SubAgentDelegator } from "./sub-agent.js";

describe("SubAgent Non-blocking Async Mode & Status Check Suite", () => {
  it("spawns sub-agent asynchronously (async: true) within 50ms and tracks task status", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);

    const startTime = Date.now();
    const result = await delegator.runSubAgent({
      taskDescription: "后台长耗时架构调研",
      async: true,
    });
    const duration = Date.now() - startTime;

    // 1. 验证非阻塞派发在 50ms 内立即返回
    expect(duration).toBeLessThan(50);
    expect(result.isAsyncRunning).toBe(true);
    expect(result.taskId).toContain("task_sub_");

    // 2. 查询初始状态应为 running
    const stateRunning = delegator.getTaskState(result.taskId);
    expect(stateRunning).toBeDefined();
    expect(stateRunning?.status).toBe("running");

    // 3. 等待后台子任务在 event loop 中异步完成
    await new Promise((r) => setTimeout(r, 100));

    // 4. 查询最终完成状态应为 completed
    const stateCompleted = delegator.getTaskState(result.taskId);
    expect(stateCompleted?.status).toBe("completed");
    expect(stateCompleted?.summary).toBeDefined();
  });

  it("queries task status via check_subagent_status tool definition", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = runtime.subAgentDelegator;

    // 派发一个异步任务
    const subRes = await delegator.runSubAgent({
      taskDescription: "评估子系统性能",
      async: true,
    });

    const checkTool = delegator.getCheckStatusTool();
    expect(checkTool.name).toBe("check_subagent_status");

    // 等待后台异步任务完成
    await new Promise((r) => setTimeout(r, 100));

    // 执行状态查询工具
    const statusOutput = await checkTool.execute({ taskId: subRes.taskId });
    expect(statusOutput).toContain("[子 Agent 状态: 已完成 (Completed)]");
    expect(statusOutput).toContain(`TaskId: ${subRes.taskId}`);
  });
});
