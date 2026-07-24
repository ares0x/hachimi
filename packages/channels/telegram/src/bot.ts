// packages/channels/telegram/src/bot.ts
import { createInterface } from "node:readline/promises";
import { loadConfig, saveConfig } from "@hachimi/config";
import { createAgentSession } from "@hachimi/core";
import { log } from "@hachimi/shared";
import { Bot } from "grammy";

export interface TelegramChannelConfig {
  token: string;
  allowedUsers?: number[];
}

/**
 * F2: Telegram Channel Bot 搭建（借鉴 Hermes Agent Gateway 机制）
 */
export function createTelegramBot(config: TelegramChannelConfig): Bot {
  const bot = new Bot(config.token);

  // 1. 全局错误捕获中间件
  bot.catch((err) => {
    log("error", `❌ [Telegram Error] Bot 捕获到网络或执行异常: ${err.message || String(err)}`);
  });

  // 2. 消息日志记录中间件
  bot.use(async (ctx, next) => {
    if (ctx.message?.text) {
      log(
        "info",
        `📩 [Telegram Receive] 来自 ${ctx.from?.first_name || "未知用户"} (ID: ${ctx.from?.id}): "${ctx.message.text}"`
      );
    }
    await next();
  });

  // 3. TELEGRAM_ALLOWED_USERS 用户 ID 白名单安全隔离中间件
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (config.allowedUsers && config.allowedUsers.length > 0) {
      if (!userId || !config.allowedUsers.includes(userId)) {
        log("warn", `⛔ [Telegram Security] 拒绝未授权的 Telegram 用户 ID: ${userId}`);
        await ctx.reply(`❌ [权限拒绝] 您的 Telegram 账号 (ID: ${userId}) 未获得授权。`);
        return;
      }
    }
    await next();
  });

  // 4. 基础指令
  bot.command("start", async (ctx) => {
    log("info", `[Telegram Command] 响应 /start 命令`);
    await ctx.reply(
      "🍯 欢迎使用 Hachimi AI Assistant Telegram Gateway 网关！直接发送文字即可对话。"
    );
  });

  bot.command("help", async (ctx) => {
    log("info", `[Telegram Command] 响应 /help 命令`);
    await ctx.reply(
      "可用命令:\n/start - 开始使用\n/help - 查看帮助\n/status - 状态查询\n直接发送文本进行智能问答。"
    );
  });

  // 5. 消息处理与 Session 会话绑定
  bot.on("message:text", async (ctx) => {
    const prompt = ctx.message.text.trim();
    if (!prompt || prompt.startsWith("/")) return;

    const chatId = ctx.chat.id;
    const sessionId = `telegram_${chatId}`;

    try {
      log("info", `🤖 [Telegram Agent Processing] 正在为 Chat: ${chatId} 生成回答...`);
      await ctx.replyWithChatAction("typing");
      const session = createAgentSession({ sessionId });

      const responseText = await session.run(prompt);
      log("info", `✅ [Telegram Agent Finished] 回答成功生成，准备回复 Telegram...`);
      await ctx.reply(responseText);
    } catch (err: any) {
      log("error", `⚠️ [Telegram Agent Error] 答复生成失败: ${err?.message || String(err)}`);
      await ctx.reply(`⚠️ 对话生成失败: ${err?.message || String(err)}`);
    }
  });

  return bot;
}

/**
 * 启动网关流程（借鉴 Hermes Agent / Maka Agent 交互配置逻辑）：
 * 1. 从 config.json / 环境变量加载；
 * 2. 若未配置则启动交互引导交互收集并保存至 config.json；
 * 3. 开启长驻长轮询监听。
 */
export async function startTelegramGateway() {
  const cfg = loadConfig();
  let token = process.env.TELEGRAM_BOT_TOKEN || cfg.channels?.telegram?.botToken || "";
  let allowedUsers =
    cfg.channels?.telegram?.allowedUsers && cfg.channels.telegram.allowedUsers.length > 0
      ? cfg.channels.telegram.allowedUsers
      : (process.env.TELEGRAM_ALLOWED_USERS || "")
          .split(",")
          .map((s) => Number(s.trim()))
          .filter(Boolean);

  // 首次运行交互引导
  if (!token && process.stdin.isTTY) {
    console.log(`\n🍯 首次使用 Hachimi Telegram Gateway 交互配置引导：`);
    console.log(`💡 提示：在 Telegram 联系 @BotFather 创建机器人并获取 API Token。\n`);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const inputToken = await rl.question("👉 请输入 Telegram Bot API Token (按 Enter 跳过): ");
      if (inputToken.trim()) {
        token = inputToken.trim();
        const inputUsers = await rl.question(
          "👉 请输入允许调用的 Telegram 用户 ID 白名单 (用逗号隔开，留空允许所有用户): "
        );
        allowedUsers = inputUsers
          .split(",")
          .map((s) => Number(s.trim()))
          .filter(Boolean);

        // 写入 config.json 写入保存
        cfg.channels = {
          ...cfg.channels,
          telegram: {
            botToken: token,
            allowedUsers: allowedUsers,
          },
        };
        saveConfig(cfg);
        console.log(`\n✅ 已自动将 Telegram 配置写入 config.json 保存！后续可直接运行。`);
      }
    } finally {
      rl.close();
    }
  }

  if (!token) {
    console.log(`
❌ 无法启动 Telegram Gateway：未找到 TELEGRAM_BOT_TOKEN 配置。

💡 使用说明（参考 Hermes Agent Gateway 配置方式）：
1. 可直接在 config.json 中写入 "channels": { "telegram": { "botToken": "xxx", "allowedUsers": [123456] } }；
2. 或在终端使用环境变量启动：
   TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjkl..." pnpm dev:telegram
`);
    return;
  }

  const bot = createTelegramBot({ token, allowedUsers });
  log("info", "🚀 Telegram Gateway 正在长驻启动中...");
  bot.start({
    onStart: (botInfo) => {
      log(
        "info",
        `✅ Telegram Bot @${botInfo.username} (ID: ${botInfo.id}) 已成功连接 Telegram API 并上线监听！`
      );
      if (allowedUsers.length > 0) {
        log("info", `🔒 白名单用户限制生效中，仅允许 ID: ${allowedUsers.join(", ")}`);
      } else {
        log("warn", `⚠️ 未设置 TELEGRAM_ALLOWED_USERS 白名单，当前允许所有 Telegram 用户对话`);
      }
    },
  });
}

// 直接运行判断
if (process.argv[1]?.includes("bot.ts") || process.argv[1]?.includes("bot.js")) {
  startTelegramGateway();
}
