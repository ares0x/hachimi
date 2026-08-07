// packages/core/src/sub-agent-trust.test.ts
//
// P0 子代理信任继承与审批升级：
// - 子代理继承父会话的 surface / trustLevel（Kun inherit 模式），永不降级到 minimal
// - 子代理需要审批时升级到父会话的审批通道（onToolApproval 透传 + policyContext）
// - 默认审批 handler 必须正确收到 channel/trustLevel/toolKind（回归：此前第 4 参错位
//   导致 minimal 收紧被绕过、safe+kind=write 静默放行）

import { describe, expect, it, vi } from "vitest";
import { SubAgentDelegator } from "./agent/sub-agent.js";
import { createHarnessRuntime } from "./runtime/harness-runtime.js";
import { ToolRegistry } from "./tools/registry.js";

function makeDelegator() {
  const runtime = createHarnessRuntime({ providerOverride: "mock" });
  return new SubAgentDelegator(runtime);
}

/** MockLLM 通过「调用工具 <name>」触发工具调用（arguments 为空对象） */
const WRITE_TASK = "调用工具 write_file 写入测试文件";
const DELETE_TASK = "调用工具 delete_file 删除测试文件";

describe("Sub-Agent trust inheritance (Kun inherit mode)", () => {
  it("inherits parent full trust: safe+kind=write runs (not silently rejected)", async () => {
    const tool = makeDelegator().getDelegationTool();
    const res = await tool.execute({ taskDescription: WRITE_TASK }, {
      sessionId: "sess_parent_full",
      channel: "tui",
      trustLevel: "full",
    } as any);
    expect(res).toMatch(/运行完成|Completed/);
    expect(res).not.toMatch(/用户拦截|用户拒绝|User Rejected/);
  });

  it("inherits parent minimal trust: safe+kind=write is rejected (regression: default handler drops trust/kind)", async () => {
    const tool = makeDelegator().getDelegationTool();
    const res = await tool.execute({ taskDescription: WRITE_TASK }, {
      sessionId: "sess_parent_min",
      channel: "telegram",
      trustLevel: "minimal",
    } as any);
    expect(res).toMatch(/运行完成|Completed/);
    expect(res).toMatch(/用户拦截|用户拒绝|User Rejected/);
  });
});

describe("Sub-Agent approval escalation to parent channel", () => {
  it("forwards needs_confirm tool to parent onToolApproval with policyContext", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);
    const tool = delegator.getDelegationTool();

    const spy = vi.fn().mockResolvedValue(true);
    const res = await tool.execute({ taskDescription: DELETE_TASK }, {
      sessionId: "sess_parent_escalate",
      channel: "web-sse",
      trustLevel: "standard",
      onToolApproval: spy,
    } as any);

    expect(res).toMatch(/运行完成|Completed/);
    expect(spy).toHaveBeenCalledTimes(1);
    const [toolName, , permission, , policyContext] = spy.mock.calls[0];
    expect(toolName).toBe("delete_file");
    expect(permission).toBe("needs_confirm");
    expect(policyContext).toMatchObject({
      channel: "web-sse",
      trustLevel: "standard",
      toolKind: "delete",
    });
  });
});

describe("ToolRegistry forwards channel/trustLevel/onToolApproval into tool ctx", () => {
  it("exposes parent policy context to delegated tools", async () => {
    const registry = new ToolRegistry();
    let captured: Record<string, unknown> = {};
    registry.register({
      name: "probe_ctx",
      description: "probe",
      permission: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        captured = {
          channel: ctx?.channel,
          trustLevel: ctx?.trustLevel,
          hasApprovalHandler: Boolean(ctx?.onToolApproval),
        };
        return "ok";
      },
    });

    const handler = vi.fn().mockResolvedValue(true);
    await registry.execute(
      "probe_ctx",
      {},
      { channel: "web-sse", trustLevel: "standard", onToolApproval: handler }
    );

    expect(captured.channel).toBe("web-sse");
    expect(captured.trustLevel).toBe("standard");
    expect(captured.hasApprovalHandler).toBe(true);
  });
});
