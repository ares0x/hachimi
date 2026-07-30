// tests/channels/approval-e2e.test.ts
// W2.2: approve → 工具继续执行；deny → 返回 cancelled 结果
// 端到端测试：通过 HarnessRuntime + 模拟审批回调验证完整审批流程与事件落盘

import { describe, expect, it, vi } from "vitest";
import { createHarnessRuntime } from "../../packages/core/src/index.js";

describe("W2.2: Approval end-to-end (approve & deny)", () => {
  function setup() {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });

    let toolExecuted = false;

    runtime.tools.register({
      name: "confirm_data_write",
      description: "需要用户确认的数据写入工具",
      permission: "needs_confirm",
      parameters: { type: "object", properties: {} },
      async execute() {
        toolExecuted = true;
        return "data_written_successfully";
      },
    });

    return {
      runtime,
      isToolExecuted: () => toolExecuted,
      resetTool: () => {
        toolExecuted = false;
      },
    };
  }

  it("approve → tool executes and result is returned", async () => {
    const { runtime, isToolExecuted } = setup();

    const output = await runtime.execute({
      prompt: "调用工具 confirm_data_write",
      channel: "web-sse",
      options: {
        onToolApproval: vi.fn().mockResolvedValue(true),
      },
    });

    expect(isToolExecuted()).toBe(true);
    expect(output.isError).toBeFalsy();
  });

  it("deny → tool does not execute and cancelled result is returned", async () => {
    const { runtime, isToolExecuted } = setup();

    const output = await runtime.execute({
      prompt: "调用工具 confirm_data_write",
      channel: "web-sse",
      options: {
        onToolApproval: vi.fn().mockResolvedValue(false),
      },
    });

    expect(isToolExecuted()).toBe(false);
    // 回复中包含拒绝/拦截信息
    expect(output.content).toMatch(
      /拦截|拒绝|cancelled|denied|rejected|User Rejected|未授权|用户/i
    );
  });

  it("approve → approval_requested event + tool_call + tool_result written to event store", async () => {
    const { runtime } = setup();

    const output = await runtime.execute({
      prompt: "调用工具 confirm_data_write",
      channel: "web-sse",
      options: {
        onToolApproval: vi.fn().mockResolvedValue(true),
      },
    });

    const eventResult = await runtime.events.list(output.sessionId, {
      limit: 100,
    });

    const eventTypes = eventResult.events.map((e) => e.type);

    // approval_requested 事件（审批被触发）
    expect(eventTypes).toContain("approval_requested");
    // tool_call 事件（工具被调用）
    expect(eventTypes).toContain("tool_call");
    // tool_result 事件（工具执行完毕）
    expect(eventTypes).toContain("tool_result");

    const toolResultEvent = eventResult.events.find((e) => e.type === "tool_result");
    expect(toolResultEvent?.payload.isError).toBe(false);
    expect(toolResultEvent?.payload.result).toBe("data_written_successfully");
  });

  it("deny → approval_requested event + tool_result shows rejection", async () => {
    const { runtime, isToolExecuted } = setup();

    const output = await runtime.execute({
      prompt: "调用工具 confirm_data_write",
      channel: "web-sse",
      options: {
        onToolApproval: vi.fn().mockResolvedValue(false),
      },
    });

    expect(isToolExecuted()).toBe(false);

    const eventResult = await runtime.events.list(output.sessionId, {
      limit: 100,
    });

    const eventTypes = eventResult.events.map((e) => e.type);

    // 应包含 approval_requested 事件
    expect(eventTypes).toContain("approval_requested");
    // 应包含 tool_result 事件（内容是拒绝消息）
    expect(eventTypes).toContain("tool_result");

    const toolResultEvent = eventResult.events.find((e) => e.type === "tool_result");
    expect(toolResultEvent?.payload.isError).toBe(true);
    expect(toolResultEvent?.payload.result).toMatch(/拦截|拒绝|denied|rejected|User Rejected/i);
  });

  it("approval_requested event contains correct toolName and permission", async () => {
    const { runtime } = setup();

    const output = await runtime.execute({
      prompt: "调用工具 confirm_data_write",
      channel: "web-sse",
      options: {
        onToolApproval: vi.fn().mockResolvedValue(true),
      },
    });

    const eventResult = await runtime.events.list(output.sessionId, {
      limit: 100,
    });

    const approvalEvent = eventResult.events.find((e) => e.type === "approval_requested");
    expect(approvalEvent).toBeDefined();
    expect(approvalEvent?.payload.toolName).toBe("confirm_data_write");
    expect(approvalEvent?.payload.permission).toBe("needs_confirm");
  });
});
