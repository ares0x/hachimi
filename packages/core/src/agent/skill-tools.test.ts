// packages/core/src/agent/skill-tools.test.ts
//
// P2.4 激活技能 allowedTools 工具面收窄：
// - 技能激活后只公布 allowedTools 内的工具 + 发现/激活/提问工具
import { join } from "node:path";
import { FileJsonStore } from "@hachimi/storage";
import { describe, expect, it } from "vitest";
import { MemoryManager } from "../memory/manager.js";
import { SkillRegistry } from "../skills/registry.js";
import { ToolRegistry } from "../tools/registry.js";
import type { LLMProvider, LLMResponse, Message, ToolDefinition } from "../types/index.js";
import { Agent } from "./agent.js";

function makeMemory() {
  return new MemoryManager(join(process.cwd(), "data-test-skill-memory.json"), new FileJsonStore());
}

class ScriptedProvider implements LLMProvider {
  toolDefsSeen: ToolDefinition[][] = [];
  script: Array<() => Promise<LLMResponse>> = [];
  async chat(_messages: Message[], tools: ToolDefinition[] = []): Promise<LLMResponse> {
    this.toolDefsSeen.push(tools);
    const next = this.script.shift();
    if (next) return await next();
    return { content: "done" };
  }
  async chatStream(messages: Message[], tools: ToolDefinition[]): Promise<LLMResponse> {
    return this.chat(messages, tools);
  }
}

describe("P2.4 skill allowedTools enforcement", () => {
  it("narrows advertised tools to the active skill's allowedTools", async () => {
    const provider = new ScriptedProvider();
    provider.script.push(async () => ({
      content: null,
      tool_calls: [
        { id: "call_act", name: "activate_skill", arguments: { skill_name: "reader-only" } },
      ],
    }));

    const tools = new ToolRegistry();
    tools.register(
      {
        name: "read_file",
        description: "read",
        permission: "safe",
        parameters: { type: "object", properties: {} },
        execute: async () => "ok",
      },
      "builtin"
    );
    tools.register(
      {
        name: "write_file",
        description: "write",
        permission: "safe",
        parameters: { type: "object", properties: {} },
        execute: async () => "ok",
      },
      "builtin"
    );
    const skills = new SkillRegistry();
    skills.register({
      name: "reader-only",
      description: "只读技能",
      permission: "safe",
      allowedTools: ["read_file"],
      load: () => ({ instructions: "只用 read_file" }),
    });

    const agent = new Agent({
      llm: provider,
      tools,
      skills,
      memory: makeMemory(),
      maxToolRounds: 3,
    });

    await agent.run("分析一下", [], {});

    const second = provider.toolDefsSeen[1]?.map((t) => t.name) ?? [];
    expect(second).toContain("read_file");
    expect(second).not.toContain("write_file");
    expect(second).toContain("activate_skill"); // 始终保留，可切换技能
  });
});
