import { describe, expect, it } from "vitest";
import type { Message } from "../types/index.js";
import { ContextBuilder } from "./builder.js";

describe("W5.1 Tool Result Size Cap & Truncation", () => {
  it("truncates long tool_result in Message content to toolResultMaxBytes limit", async () => {
    const builder = new ContextBuilder();
    const longOutput = "A".repeat(12000); // 12KB output

    const messages: Message[] = [
      {
        id: "msg_1",
        role: "user",
        content: "Run big command",
        timestamp: Date.now(),
      },
      {
        id: "msg_2",
        role: "assistant",
        content: `Tool output: ${longOutput}`,
        timestamp: Date.now(),
      },
    ];

    const built = await builder.build({
      history: messages,
      options: { toolResultMaxBytes: 1024 },
    });

    expect(built.systemPrompt).toBeDefined();
    expect(built.parts.historySummary).toBeDefined();
    expect(built.systemPrompt).toContain("[...工具输出超限已截断");
    expect(built.systemPrompt.length).toBeLessThan(4000);
  });
});
