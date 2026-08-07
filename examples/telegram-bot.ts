/**
 * Example: Running Hachimi as a Telegram bot
 *
 * Prerequisites:
 * 1. Create a bot with @BotFather and get the token
 * 2. Set TELEGRAM_BOT_TOKEN and HACHIMI_ALLOWED_USERS env vars
 */

// The Telegram channel is built-in. Just run:
// TELEGRAM_BOT_TOKEN=your_token HACHIMI_ALLOWED_USERS=123456 pnpm dev:telegram

// For custom bot logic, you can import the runtime directly:
import { getOrCreateHarnessRuntime } from "@hachimi/core";

async function handleMessage(userId: number, text: string) {
  const runtime = getOrCreateHarnessRuntime();
  const result = await runtime.execute({
    channel: "telegram",
    userId: String(userId),
    prompt: text,
  });
  return result.content;
}

// Example usage:
// handleMessage(123456, "Hello Hachimi!").then(console.log);
