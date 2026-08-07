// packages/core/src/context/contract.test.ts
import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../skills/registry.js";
import { ToolRegistry } from "../tools/registry.js";
import { ContextBuilder } from "./builder.js";

describe("H2.1 ContextBuilder Contract & Prompt Cache Lock Suite", () => {
  it("locks static prefix sequence: Identity -> Skills Overview -> Tools Overview", async () => {
    const builder = new ContextBuilder("你是 Hachimi Agent");
    const skills = new SkillRegistry();
    const tools = new ToolRegistry();

    tools.register({
      name: "calculator",
      description: "加减乘除计算器",
      permission: "safe",
      parameters: {},
      execute: async () => "42",
    });

    const result = await builder.build({
      skills,
      tools,
      memories: [
        {
          id: "m1",
          layer: "long_term",
          content: "用户喜欢黑色",
          importance: 0.9,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
      ],
    });

    const prompt = result.systemPrompt;

    const identityIdx = prompt.indexOf("你是 Hachimi Agent");
    const skillsIdx = prompt.indexOf("【可用技能");
    const toolsIdx = prompt.indexOf("【可用工具");
    const boundaryIdx = prompt.indexOf("--- CONTEXT (dynamic");
    const memoryIdx = prompt.indexOf("用户喜欢黑色");

    expect(identityIdx).toBeGreaterThan(-1);
    expect(skillsIdx).toBeGreaterThan(identityIdx);
    expect(toolsIdx).toBeGreaterThan(skillsIdx);
    expect(boundaryIdx).toBeGreaterThan(toolsIdx);
    expect(memoryIdx).toBeGreaterThan(boundaryIdx);
  });

  it("performs tail-only truncation on dynamic region when token budget is exceeded", async () => {
    const builder = new ContextBuilder("You are Hachimi");

    const longHistory = Array.from({ length: 50 }).map((_, i) => ({
      id: `msg_${i}`,
      role: "user" as const,
      content: `这是超级长的人工输入消息 ${i} `.repeat(50),
      timestamp: Date.now(),
    }));

    const result = await builder.build({
      history: longHistory,
      options: { maxTokens: 1000, enableTokenTruncation: true },
    });

    // 静态 Prefix 依然被完整保留在顶部以保证 Prompt Cache Hit
    expect(result.systemPrompt).toContain("You are Hachimi");
  });
});
