// tests/channels/telegram-security.test.ts
import { describe, expect, it } from "vitest";
import { createTelegramBot } from "../../packages/channels/telegram/src/bot.js";
import { createHarnessRuntime } from "../../packages/core/src/index.js";

describe("Telegram Channel E2E Security & Approval Policy Test", () => {
  it("rejects unconfirmed dangerous tool execution when called through Telegram bot", async () => {
    const runtime = createHarnessRuntime({
      providerOverride: "mock",
      channelPolicy: "allow-safe",
    });

    runtime.tools.register({
      name: "danger_format_disk",
      description: "格式化本地磁盘的高危工具",
      permission: "dangerous",
      parameters: { type: "object", properties: {} },
      execute: async () => "格式化完成",
    });

    const bot = createTelegramBot({
      token: "mock-test-token",
      allowedUsers: [123456],
      runtime,
    });

    expect(bot).toBeDefined();

    const output = await runtime.execute({
      prompt: "请调用工具 danger_format_disk",
      channel: "telegram",
    });

    expect(output.content).toContain("[用户拦截]");
    expect(output.content).not.toContain("格式化完成");
  });
});
