// packages/channels/telegram/src/bot.test.ts
import { describe, expect, it } from "vitest";
import { createTelegramBot } from "./bot.js";

describe("Phase F2 Telegram Channel Bot Gateway", () => {
  it("creates Bot instance with configuration and whitelist middleware", () => {
    const bot = createTelegramBot({
      token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
      allowedUsers: [123456],
    });

    expect(bot).toBeDefined();
    expect(bot.api).toBeDefined();
  });
});
