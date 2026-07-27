// packages/core/src/agent/approval-flow.test.ts
// 审批流修复 (W2.2 打通) + 拒绝熔断测试
import { join } from "node:path";
import { generateId } from "@hachimi/shared";
import { FileJsonStore } from "@hachimi/storage";
import { describe, expect, it, vi } from "vitest";
import { MemoryManager } from "../memory/manager.js";
import { ToolRegistry } from "../tools/registry.js";
import type { LLMProvider, LLMResponse, Message, ToolDefinition } from "../types/index.js";
import { Agent } from "./agent.js";
import { MockLLMProvider } from "./llm.js";

function makeMemory() {
  return new MemoryManager(join(process.cwd(), "data-test-agent-memory.json"), new FileJsonStore());
}

function registerConfirmTool(tools: ToolRegistry, mark: { ran: boolean }) {
  tools.register({
    name: "confirm_tool",
    description: "需确认工具",
    permission: "needs_confirm",
    parameters: { type: "object", properties: {} },
    async execute() {
      mark.ran = true;
      return "confirm_tool_executed";
    },
  });
}

/** 始终重复调用同一 needs_confirm 工具的 mock，用于触发拒绝熔断 */
class AlwaysConfirmToolMock implements LLMProvider {
  async chat(_messages: Message[], _tools: ToolDefinition[] = []): Promise<LLMResponse> {
    return {
      content: null,
      tool_calls: [{ id: generateId("call_"), name: "confirm_tool", arguments: {} }],
    };
  }
  async chatStream(messages: Message[], tools: ToolDefinition[]): Promise<LLMResponse> {
    return this.chat(messages, tools);
  }
}

describe("Agent per-call 审批 handler 优先级", () => {
  it("使用 per-call onToolApproval 放行 needs_confirm 工具", async () => {
    const tools = new ToolRegistry();
    const mark = { ran: false };
    registerConfirmTool(tools, mark);

    // 故意不传构造时 onToolApproval，模拟 daemon 默认场景（仅 policy 兜底）
    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory: makeMemory(),
      maxToolRounds: 3,
    });

    const perCallApproval = vi.fn().mockResolvedValue(true);
    const reply = await agent.run("调用工具 confirm_tool", [], {
      onToolApproval: perCallApproval,
    });

    expect(perCallApproval).toHaveBeenCalledWith("confirm_tool", {}, "needs_confirm");
    expect(mark.ran).toBe(true);
    expect(reply).not.toContain("用户拒绝");
  });

  it("per-call handler 优先于构造时 handler", async () => {
    const tools = new ToolRegistry();
    const mark = { ran: false };
    registerConfirmTool(tools, mark);

    const constructionApproval = vi.fn().mockResolvedValue(false); // 构造时拒绝
    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory: makeMemory(),
      maxToolRounds: 3,
      onToolApproval: constructionApproval,
    });

    const perCallApproval = vi.fn().mockResolvedValue(true); // per-call 放行
    const reply = await agent.run("调用工具 confirm_tool", [], {
      onToolApproval: perCallApproval,
    });

    expect(perCallApproval).toHaveBeenCalled();
    expect(constructionApproval).not.toHaveBeenCalled();
    expect(mark.ran).toBe(true);
    expect(reply).not.toContain("用户拒绝");
  });

  it("无 per-call handler 时回退到构造时 handler", async () => {
    const tools = new ToolRegistry();
    const mark = { ran: false };
    registerConfirmTool(tools, mark);

    const constructionApproval = vi.fn().mockResolvedValue(true);
    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory: makeMemory(),
      maxToolRounds: 3,
      onToolApproval: constructionApproval,
    });

    await agent.run("调用工具 confirm_tool"); // 无 per-call handler

    expect(constructionApproval).toHaveBeenCalled();
    expect(mark.ran).toBe(true);
  });
});

describe("Agent 拒绝熔断器", () => {
  it("同一工具被拒 2 次后短路，第 3 次不再调用审批 handler", async () => {
    const tools = new ToolRegistry();
    const mark = { ran: false };
    registerConfirmTool(tools, mark);

    const agent = new Agent({
      llm: new AlwaysConfirmToolMock(),
      tools,
      memory: makeMemory(),
      maxToolRounds: 10,
    });

    const approval = vi.fn().mockResolvedValue(false); // 始终拒绝
    const reply = await agent.run("调用工具 confirm_tool", [], {
      onToolApproval: approval,
    });

    // 工具从未真正执行
    expect(mark.ran).toBe(false);
    // 审批 handler 只被调用 2 次（第 3 次起被熔断守卫短路）
    expect(approval).toHaveBeenCalledTimes(2);
    // 最终返回停止消息
    expect(reply).toMatch(/已停止|多次工具被拒/);
  });
});
