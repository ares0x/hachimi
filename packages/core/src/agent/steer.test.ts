// packages/core/src/agent/steer.test.ts
import { describe, expect, it } from "vitest";
import { ContextBuilder } from "../context/builder.js";
import { MemoryManager } from "../memory/manager.js";
import { ToolRegistry } from "../tools/registry.js";
import type { LLMProvider, LLMResponse, Message, ToolDefinition } from "../types/index.js";
import { Agent } from "./agent.js";

class MultiRoundMockProvider implements LLMProvider {
  public round = 0;
  public capturedMessages: Message[][] = [];

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    this.round++;
    this.capturedMessages.push([...messages]);

    if (this.round === 1) {
      return {
        content: "第一轮：需要调用工具 calculator",
        tool_calls: [
          {
            id: "call_1",
            name: "calculator",
            arguments: { a: 1, b: 1, operator: "+" },
          },
        ],
      };
    }

    return {
      content: `第${this.round}轮完成回答`,
    };
  }
}

describe("C6 Mid-turn Steering (steer & followUp)", () => {
  it("steer() returns false when agent is idle", () => {
    const provider = new MultiRoundMockProvider();
    const tools = new ToolRegistry();
    const memory = new MemoryManager("data/test-mem.json");
    const agent = new Agent({ llm: provider, tools, memory });

    expect(agent.isRunning()).toBe(false);
    expect(agent.steer("change plan")).toBe(false);
  });

  it("steer() injects steering prompt during tool loop", async () => {
    const provider = new MultiRoundMockProvider();
    const tools = new ToolRegistry();
    tools.register({
      name: "calculator",
      description: "calc",
      parameters: {},
      execute: async () => "2",
    });

    const memory = new MemoryManager("data/test-mem.json");
    const agent = new Agent({ llm: provider, tools, memory });

    // 监听工具开始，并在第 1 轮工具开始时发送 steer 修正指令
    const runPromise = agent.run("初始请求", [], {
      onToolStart: () => {
        expect(agent.isRunning()).toBe(true);
        const success = agent.steer("请把方案调整为更加优雅的方式");
        expect(success).toBe(true);
      },
    });

    const finalAnswer = await runPromise;
    expect(finalAnswer).toBe("第2轮完成回答");

    // 检查第 2 轮大模型拿到的消息队列中是否包含了 [用户中途转向修正指令]
    expect(provider.capturedMessages.length).toBe(2);
    const round2Messages = provider.capturedMessages[1];
    const steerMsg = round2Messages.find((m) =>
      String(m.content).includes("[用户中途转向修正指令]: 请把方案调整为更加优雅的方式")
    );
    expect(steerMsg).toBeDefined();
  });

  it("followUp() queues prompt and executes after current turn", async () => {
    const provider = new MultiRoundMockProvider();
    const tools = new ToolRegistry();
    tools.register({
      name: "calculator",
      description: "calc",
      parameters: {},
      execute: async () => "2",
    });
    const memory = new MemoryManager("data/test-mem.json");
    const agent = new Agent({ llm: provider, tools, memory });

    agent.followUp("追问下一个问题");
    const answer = await agent.run("首个问题");

    expect(typeof answer).toBe("string");
    expect(answer.length).toBeGreaterThan(0);
  });
});
