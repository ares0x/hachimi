// Re-entrancy regression: Agent.run() can be nested — SubAgentDelegator drives
// child tasks through the SAME runtime/agent instance while the parent loop is
// suspended on a tool call. Each nested run must own its per-run state so a
// child never clobbers the parent's steer queue, tool set or termination flag.
import { describe, expect, it } from "vitest";
import { MemoryManager } from "../memory/manager.js";
import { ToolRegistry } from "../tools/registry.js";
import type { LLMProvider, LLMResponse, Message, ToolDefinition } from "../types/index.js";
import { Agent } from "./agent.js";

class CapturingProvider implements LLMProvider {
  calls: Message[][] = [];
  private schedule: Array<"tool" | "final">;

  constructor(rounds: Array<"tool" | "final">) {
    this.schedule = rounds;
  }

  async chat(messages: Message[], _tools?: ToolDefinition[]): Promise<LLMResponse> {
    this.calls.push(messages);
    const kind = this.schedule[this.calls.length - 1] ?? "final";
    if (kind === "tool") {
      return {
        content: "working",
        tool_calls: [
          { id: `call_${this.calls.length}`, name: "calculator", arguments: { a: 1, b: 2 } },
        ],
      };
    }
    return { content: "done" };
  }
}

describe("Agent re-entrancy (nested runs on the same instance)", () => {
  it("keeps isRunning() true across a nested run and restores state after", async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: "calculator",
      description: "calc",
      parameters: {},
      execute: async () => "3",
    });
    const memory = new MemoryManager("data/test-mem-reentrancy.json");

    let parentAgent!: Agent;
    let runningDuringNested = false;
    let childCalls = 0;

    const parentProvider = new CapturingProvider(["tool", "final"]);
    const originalChat = parentProvider.chat.bind(parentProvider);
    parentProvider.chat = async (messages, toolDefs) => {
      const round = parentProvider.calls.length + 1;
      if (round === 1) {
        // Nested run on the SAME instance (sub-agent path).
        runningDuringNested = parentAgent.isRunning();
        const childProvider = new CapturingProvider(["final"]);
        childProvider.chat = async (m) => {
          childCalls++;
          expect(m.some((x) => String(x.content).includes("[用户中途转向修正指令]"))).toBe(false);
          return { content: "child done" };
        };
        const child = new Agent({ llm: childProvider, tools, memory, maxToolRounds: 3 });
        const childResult = await child.run("child task", []);
        expect(childResult).toBe("child done");
      }
      return originalChat(messages, toolDefs);
    };

    parentAgent = new Agent({ llm: parentProvider, tools, memory, maxToolRounds: 6 });
    const answer = await parentAgent.run("parent task", []);
    expect(answer).toBe("done");
    expect(runningDuringNested).toBe(true);
    expect(parentAgent.isRunning()).toBe(false);
    expect(childCalls).toBe(1);
  });

  it("a parent steer is not consumed by a nested run but fires in the parent's next round", async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: "calculator",
      description: "calc",
      parameters: {},
      execute: async () => "3",
    });
    const memory = new MemoryManager("data/test-mem-reentrancy.json");

    let parentAgent!: Agent;
    let parentSawSteer = false;

    const parentProvider = new CapturingProvider(["tool", "final"]);
    const originalChat = parentProvider.chat.bind(parentProvider);
    parentProvider.chat = async (messages, toolDefs) => {
      const round = parentProvider.calls.length + 1;
      if (round === 1) {
        parentAgent.steer("转向指令");
        const child = new Agent({
          llm: new CapturingProvider(["final"]),
          tools,
          memory,
          maxToolRounds: 3,
        });
        await child.run("child task", []);
      }
      if (round === 2) {
        parentSawSteer = messages.some((m) =>
          String(m.content).includes("[用户中途转向修正指令]: 转向指令")
        );
      }
      return originalChat(messages, toolDefs);
    };

    parentAgent = new Agent({ llm: parentProvider, tools, memory, maxToolRounds: 6 });
    const answer = await parentAgent.run("parent task", []);
    expect(answer).toBe("done");
    expect(parentSawSteer).toBe(true);
  });
});
