// apps/server/src/main.ts
import { createHachimiApiServer } from "@hachimi/channel-api";
import { createTelegramBot } from "@hachimi/channel-telegram";
import { loadConfig } from "@hachimi/config";
import { createHarnessRuntime } from "@hachimi/core";
import { log } from "@hachimi/shared";

async function main() {
  // Core decoupling: Global single HarnessRuntime instance initialization
  const runtime = createHarnessRuntime();
  log("info", "🚀 Unified HarnessRuntime engine instance successfully initialized");

  const apiServer = createHachimiApiServer({ runtime });

  // 1. Start HTTP REST / SSE / WebSocket / Web UI daemon process
  const address = await apiServer.listen();
  log("info", `🌐 Web client accessible at: ${address}`);

  // 2. Read config, auto start Telegram Bot Gateway sharing the same HarnessRuntime
  const cfg = loadConfig();
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN || cfg.channels?.telegram?.botToken || "";
  const allowedUsers =
    cfg.channels?.telegram?.allowedUsers && cfg.channels.telegram.allowedUsers.length > 0
      ? cfg.channels.telegram.allowedUsers
      : (process.env.TELEGRAM_ALLOWED_USERS || "")
          .split(",")
          .map((s) => Number(s.trim()))
          .filter(Boolean);

  let telegramBot: any = null;

  if (telegramToken) {
    telegramBot = createTelegramBot({ token: telegramToken, allowedUsers, runtime });
    log("info", "🚀 Launching Telegram Bot Channel Gateway...");
    telegramBot.start({
      onStart: (botInfo: any) => {
        log("info", `✅ Telegram Bot @${botInfo.username} online and listening!`);
      },
    });
  } else {
    log(
      "info",
      "💡 Info: No Telegram Bot token configured. Add `channels.telegram` to config.json anytime to enable Telegram gateway."
    );
  }

  // Graceful shutdown
  process.on("SIGINT", async () => {
    log("info", "Safely shutting down Hachimi Daemon Server and Channel Gateways...");
    if (telegramBot) {
      try {
        await telegramBot.stop();
      } catch {
        /* ignore */
      }
    }
    await apiServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  log("error", "❌ Fatal Daemon Server Error:", err);
  process.exit(1);
});
