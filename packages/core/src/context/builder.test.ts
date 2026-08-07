import { defaultTokenEstimator } from "@hachimi/shared";
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { ContextBuilder } from "./builder.js";

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
    expect(prompt.indexOf("Hachimi")).toBeGreaterThan(-1);
    expect(prompt.indexOf("Hachimi")).toBeLessThan(prompt.indexOf("【可用工具"));
    expect(prompt.indexOf("【可用工具")).toBeLessThan(prompt.indexOf("--- CONTEXT (dynamic"));
    expect(prompt.indexOf("--- CONTEXT (dynamic")).toBeLessThan(prompt.indexOf("用户喜欢咖啡"));
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
    expect(built.systemPrompt).toContain("You are Hachimi");
    // Token 必须受到上限控制。
    // 允许少量余量：85% 触发压力注入 note（给模型的"停止探索"指令）会追加
    // ~70 tokens 到截断后的 prompt 末尾，这是预算管理的新增预期开销。
    const tokenCount = defaultTokenEstimator(built.systemPrompt);
    expect(tokenCount).toBeLessThanOrEqual(650);
  });

  it("W5.1: truncates tool_result exceeding 8KB (toolResultMaxBytes) with summary notice", async () => {
    const builder = new ContextBuilder();
    const hugeOutput = "A".repeat(10000);
    const history = [
      {
        id: "msg_large",
        role: "assistant" as const,
        content: hugeOutput,
        timestamp: Date.now(),
      },
    ];

    const built = await builder.build({
      history,
      options: { toolResultMaxBytes: 8192 },
    });

    expect(built.systemPrompt).toContain("[...工具输出超限已截断");
    expect(built.systemPrompt).not.toContain(hugeOutput);
  });

  it("W5.2: performs rule-based compaction on messages exceeding 30 rounds while locking static prefix", async () => {
    const builder = new ContextBuilder();
    const longHistory = Array.from({ length: 70 }, (_, i) => ({
      id: `msg_${i}`,
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `第 ${i} 轮对话内容详情`,
      timestamp: Date.now(),
    }));

    const built = await builder.build({
      history: longHistory,
      options: { summaryThreshold: 20 },
    });

    expect(built.systemPrompt).toContain("【对话摘要】");
    expect(built.systemPrompt).toContain("【最近消息】");
    // 静态前缀锁定不动
    expect(built.systemPrompt.indexOf("Hachimi")).toBeLessThan(
      built.systemPrompt.indexOf("--- CONTEXT (dynamic")
    );
  });
});
