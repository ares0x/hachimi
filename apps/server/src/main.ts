// apps/server/src/main.ts
import { createHachimiApiServer } from "@hachimi/channel-api";
import { createTelegramBot } from "@hachimi/channel-telegram";
import { loadConfig } from "@hachimi/config";
import { createHarnessRuntime } from "@hachimi/core";
import { log } from "@hachimi/shared";

async function main() {
  // 核心解耦：全局仅初始化一个唯一的 HarnessRuntime 实例
  const runtime = createHarnessRuntime();
  log("info", "🚀 统一 HarnessRuntime 引擎实例已成功建立");

  const apiServer = createHachimiApiServer({ runtime });

  // 1. 启动 HTTP REST / SSE / WebSocket / Web UI 守护进程
  const address = await apiServer.listen();
  console.log(`🌐 极简 Web 客户端已在此链接开放访问: ${address}`);

  // 2. 读取配置，自动并发拉起 Telegram Bot Gateway (共享同一个 HarnessRuntime)
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
    log("info", "🚀 正在自动启动 Telegram Bot 通道网关...");
    telegramBot.start({
      onStart: (botInfo: any) => {
        log("info", `✅ Telegram Bot @${botInfo.username} 已成功上线并开始监听！`);
      },
    });
  } else {
    log(
      "info",
      "💡 提示：未检测到 Telegram Bot 配置。随时可在 config.json 中写入 channels.telegram 启动 Telegram 连通。"
    );
  }

  // 优雅退出
  process.on("SIGINT", async () => {
    console.log("\n正在安全关闭 Hachimi Daemon Server 与各 Gateway 通道...");
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
  console.error("❌ Fatal Daemon Server Error:", err);
  process.exit(1);
});
