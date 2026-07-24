import { describe, it, expect } from "vitest";
import { Agent } from "./agent.js";
import { MockLLMProvider } from "./llm.js";
import { ToolRegistry } from "../tools/registry.js";
import { MemoryManager } from "../memory/manager.js";
import { FileJsonStore } from "@hachimi/storage";
import { join } from "node:path";

describe("Agent tool loop", () => {
  it("calculator tool returns numeric result text", async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: "calculator",
      description: "calc",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
          operator: { type: "string" },
        },
        required: ["a", "b", "operator"],
      },
      async execute(args) {
        const { a, b, operator } = args as {
          a: number;
          b: number;
          operator: string;
        };
        if (operator === "+") return String(a + b);
        return "0";
      },
    });

    const memory = new MemoryManager(
      join(process.cwd(), "data-test-agent-memory.json"),
      new FileJsonStore()
    );

    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory,
      maxToolRounds: 3,
    });

    const reply = await agent.run("请计算 1+2");
    expect(reply).toMatch(/3/);
  });

  it("streams response chunks via onChunk callback", async () => {
    const tools = new ToolRegistry();
    const memory = new MemoryManager(
      join(process.cwd(), "data-test-agent-memory.json"),
      new FileJsonStore()
    );

    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory,
    });

    const chunks: string[] = [];
    const reply = await agent.run("你好", [], {
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(reply).toBeDefined();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toBe(reply);
  });

  it("triggers onToolStart and onToolEnd callbacks during tool loop", async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: "calculator",
      description: "calc",
      parameters: {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" }, operator: { type: "string" } },
        required: ["a", "b", "operator"],
      },
      async execute(args: any) {
        return String(args.a + args.b);
      },
    });

    const memory = new MemoryManager(
      join(process.cwd(), "data-test-agent-memory.json"),
      new FileJsonStore()
    );

    let startedTool = "";
    let endedTool = "";

    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory,
      onToolStart: (name) => {
        startedTool = name;
      },
      onToolEnd: (name) => {
        endedTool = name;
      },
    });

    await agent.run("请计算 2+3");
    expect(startedTool).toBe("calculator");
    expect(endedTool).toBe("calculator");
  });
});
