// packages/core/src/agent/sub-agent-capability.test.ts
//
// P2 子代理角色化能力面 + 输出隔离：
// - Agent 级能力面硬拦截：allowedTools 之外的工具调用被拒绝且不执行
// - delegate_subagent({subagentType:"explore"})：子代理只读面，write_file 被拦、read_file 放行
// - 角色类型进入子代理 worker 系统提示
// - contextSummary 超限截断（防撑爆子代理上下文）

import { join } from "node:path";
import { FileJsonStore } from "@hachimi/storage";
import { describe, expect, it, vi } from "vitest";
import { MemoryManager } from "../memory/manager.js";
import { createHarnessRuntime } from "../runtime/harness-runtime.js";
import { ToolRegistry } from "../tools/registry.js";
import { Agent } from "./agent.js";
import { MockLLMProvider } from "./llm.js";
import { SubAgentDelegator } from "./sub-agent.js";

/** MockLLM 通过「调用工具 <name>」触发工具调用（arguments 为空对象） */
const WRITE_TASK = "调用工具 write_file 写入测试文件";
const READ_TASK = "调用工具 read_file 读取测试文件";

describe("P2 Agent capability surface hard interception", () => {
  it("rejects tools outside allowedTools without executing them", async () => {
    const tools = new ToolRegistry();
    const writeSpy = vi.fn().mockResolvedValue("written");
    tools.register({
      name: "write_file",
      description: "write",
      kind: "write",
      permission: "safe",
      parameters: { type: "object", properties: {} },
      execute: writeSpy,
    });
    tools.register({
      name: "read_file",
      description: "read",
      kind: "read",
      readOnly: true,
      permission: "safe",
      parameters: { type: "object", properties: {} },
      execute: async () => "file content",
    });

    const memory = new MemoryManager(
      join(process.cwd(), "data-test-p2-capability.json"),
      new FileJsonStore()
    );
    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory,
      maxToolRounds: 3,
    });

    // 只公布 read_file，模型却尝试调用 write_file → 必须被能力面拦截
    const reply = await agent.run(WRITE_TASK, [], { allowedTools: ["read_file"] });

    expect(reply).toMatch(/能力面拦截/);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe("P2 delegate_subagent role-based read-only surface", () => {
  it("blocks write_file but allows read_file for explore sub-agent", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);
    const tool = delegator.getDelegationTool();

    // 只读面：写工具被硬拦截
    const writeRes = await tool.execute({ taskDescription: WRITE_TASK, subagentType: "explore" }, {
      sessionId: "sess_p2_explore",
      channel: "tui",
      trustLevel: "full",
    } as any);
    expect(String(writeRes)).toMatch(/能力面拦截/);

    // 只读面：读工具放行执行（结果非拦截提示）
    const readRes = await tool.execute({ taskDescription: READ_TASK, subagentType: "explore" }, {
      sessionId: "sess_p2_explore2",
      channel: "tui",
      trustLevel: "full",
    } as any);
    expect(String(readRes)).not.toMatch(/能力面拦截/);
    expect(String(readRes)).toMatch(/运行完成|Completed/);
  });

  it("general-purpose sub-agent retains full tool access", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);
    const tool = delegator.getDelegationTool();

    const res = await tool.execute(
      { taskDescription: WRITE_TASK, subagentType: "general-purpose" },
      { sessionId: "sess_p2_gp", channel: "tui", trustLevel: "full" } as any
    );
    expect(String(res)).not.toMatch(/能力面拦截/);
    expect(String(res)).toMatch(/运行完成|Completed/);
  });
});

describe("P2 sub-agent role prompt & context summary isolation", () => {
  it("injects subagentType role constraints into the worker system prompt", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);
    const executeSpy = vi.spyOn(runtime, "execute");

    await delegator.runSubAgent({
      taskDescription: "审查登录模块的安全性",
      subagentType: "reviewer",
    });

    const promptArg = executeSpy.mock.calls[0]?.[0]?.prompt ?? "";
    expect(promptArg).toContain("Dedicated Worker Sub-Agent Task (reviewer)");
    expect(promptArg).toMatch(/adversarial READ-ONLY reviewer/);
  });

  it("truncates oversized contextSummary to protect sub-agent context", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const delegator = new SubAgentDelegator(runtime);
    const executeSpy = vi.spyOn(runtime, "execute");

    const result = await delegator.runSubAgent({
      taskDescription: "基于既有调研完成设计方案",
      contextSummary: "x".repeat(9000), // 超过 8000 字符上限
    });

    expect(result.success).toBe(true);
    const promptArg = executeSpy.mock.calls[0]?.[0]?.prompt ?? "";
    expect(promptArg).toContain("父 Agent 已掌握的信息");
    expect(promptArg).toMatch(/内容过长已截断/);
    // 截断后 prompt 不应携带完整 9000 字符原文（最长连续 x 不超过 8000 上限）
    const longestXRun = Math.max(
      0,
      ...Array.from(promptArg.matchAll(/x+/g)).map((m) => m[0].length)
    );
    expect(longestXRun).toBe(8000);
  });
});
