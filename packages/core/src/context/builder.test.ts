import { describe, it, expect } from "vitest";
import { ContextBuilder } from "./builder.js";
import { ToolRegistry } from "../tools/registry.js";
import { defaultTokenEstimator } from "@hachimi/shared";

describe("ContextBuilder Prompt-Cache stability and tail truncation", () => {
  it("keeps static identity, skills, and tools prefix at top of system prompt", async () => {
    const builder = new ContextBuilder();
    const tools = new ToolRegistry();
    tools.register({
      name: "test_tool",
      description: "test tool desc",
      parameters: {},
      execute: async () => "ok",
      permission: "safe",
    });

    const built = await builder.build({
      tools,
      memories: [
        {
          id: "mem1",
          layer: "long_term",
          content: "用户喜欢咖啡",
          importance: 0.8,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
      ],
    });

    const prompt = built.systemPrompt;
    expect(prompt.indexOf("你是 hachimi")).toBeLessThan(prompt.indexOf("【可用工具】"));
    expect(prompt.indexOf("【可用工具】")).toBeLessThan(prompt.indexOf("--- 动态上下文边界 ---"));
    expect(prompt.indexOf("--- 动态上下文边界 ---")).toBeLessThan(prompt.indexOf("用户喜欢咖啡"));
  });

  it("performs tail-only truncation on dynamic history blocks when exceeding token budget", async () => {
    const builder = new ContextBuilder();
    const history = Array.from({ length: 50 }, (_, i) => ({
      id: `msg_${i}`,
      role: "user" as const,
      content: `这是很长的大段历史消息 ${i} `.repeat(20),
      timestamp: Date.now(),
    }));

    const built = await builder.build({
      history,
      tokenEstimator: defaultTokenEstimator,
      options: {
        maxTokens: 500,
        enableTokenTruncation: true,
      },
    });

    // 必须保留静态前缀 header
    expect(built.systemPrompt).toContain("你是 hachimi");
    // Token 必须受到上限控制
    const tokenCount = defaultTokenEstimator(built.systemPrompt);
    expect(tokenCount).toBeLessThanOrEqual(500);
  });
});
