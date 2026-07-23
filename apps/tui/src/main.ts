// apps/tui/src/main.ts
/**
 * Hachimi TUI 增强与沉浸式交互入口
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { generateId } from "@hachimi/shared";
import type { Message } from "../../../packages/core/src/types/index.js";
import { createAppContext } from "./app-context.js";
import { handleSlashCommand, SLASH_COMMANDS } from "./ui/commands.js";
import { renderModalBox } from "./ui/modal.js";
import { HachimiTUIApp } from "./ui/app.js";
import { getActiveTheme, colorize } from "./ui/theme.js";

async function main() {
  let rl!: readline.Interface;

  const ctx = createAppContext({
    async onToolApproval(toolName, args, permission) {
      const theme = getActiveTheme();
      const title = colorize(`⚠️ [权限拦截确认] 工具 [${toolName}] (${permission})`, theme.colors.warning);
      console.log(`\n${title}`);
      console.log(colorize(`   参数: ${JSON.stringify(args)}`, theme.colors.subtext));

      const ans = (await rl.question(colorize("   👉 是否允许执行该工具？(y/N): ", theme.colors.primary)))
        .trim()
        .toLowerCase();

      const approved = ans === "y" || ans === "yes";
      if (approved) {
        console.log(colorize("   ✅ 已授权执行", theme.colors.success));
      } else {
        console.log(colorize("   ❌ 已拒绝执行", theme.colors.error));
      }
      return approved;
    },
  });

  const { config, sessions, agent } = ctx;

  const forceCli = process.argv.includes("--cli");

  if (!forceCli) {
    const tuiApp = new HachimiTUIApp({ ctx });
    await tuiApp.start();
  } else {
    const status = ctx.getStatus();
    printBanner({
      title: status.title,
      provider: status.llm.provider,
      sessionId: status.session.id,
      memCount: status.memory.longTermCount,
      skillNames: status.skills.join(", ") || "无",
      dataDir: status.paths.dataDir,
    });
  }

  // 命令行补全提示函数
  function completer(line: string) {
    if (line.startsWith("/")) {
      const hits = SLASH_COMMANDS.filter((c) => c.name.startsWith(line.toLowerCase())).map((c) => c.name);
      return [hits.length ? hits : SLASH_COMMANDS.map((c) => c.name), line];
    }
    return [[], line];
  }

  rl = readline.createInterface({
    input,
    output,
    completer,
  });

  while (true) {
    let userInput = "";
    const theme = getActiveTheme();
    const promptLabel = colorize("你: ", theme.colors.primary);

    try {
      userInput = (await rl.question(`\n${promptLabel}`)).trim();
    } catch {
      break;
    }

    if (!userInput) continue;

    try {
      // 统一 Slash 命令分发
      const res = await handleSlashCommand(userInput, ctx);

      if (res.action === "exit") {
        console.log(colorize(res.content || "再见！", theme.colors.subtext));
        break;
      }

      if (res.action === "clear") {
        console.log(colorize(res.content || "", theme.colors.success));
        continue;
      }

      if (res.action === "message") {
        console.log(colorize(res.content || "", theme.colors.text));
        continue;
      }

      if (res.action === "modal") {
        console.log(
          renderModalBox({
            title: res.title || " 信息 ",
            content: res.content || "",
            theme,
          })
        );
        continue;
      }

      // 正常对话响应 + 思考 Spinner 状态
      const spinner = colorize("⠋ [Hachimi 思考中...]", theme.colors.warning);
      process.stdout.write(`${spinner}\r`);

      const history = sessions.getHistory();
      const reply = await agent.run(userInput, history);

      // 清除 spinner
      process.stdout.write(" ".repeat(30) + "\r");

      const botLabel = colorize("hachimi: ", theme.colors.assistantRole);
      console.log(`${botLabel}${reply}`);

      const userMsg: Message = {
        id: generateId("msg_"),
        role: "user",
        content: userInput,
        timestamp: Date.now(),
      };
      const assistantMsg: Message = {
        id: generateId("msg_"),
        role: "assistant",
        content: reply,
        timestamp: Date.now(),
      };
      sessions.appendMessage(userMsg);
      sessions.appendMessage(assistantMsg);
    } catch (err) {
      console.error(colorize("出错了：", theme.colors.error), err);
    }
  }

  try {
    sessions.save();
  } catch {
    /* ignore */
  }
  rl.close();
}

function printBanner(info: {
  title: string;
  provider: string;
  sessionId: string;
  memCount: number;
  skillNames: string;
  dataDir: string;
}) {
  const theme = getActiveTheme();
  console.log(colorize("========================================", theme.colors.primary));
  console.log(colorize(`  ${info.title}  |  Enhanced TUI Engine`, theme.colors.primary));
  console.log(colorize("========================================", theme.colors.primary));
  console.log(`  model:   ${info.provider}`);
  console.log(`  session: ${info.sessionId}`);
  console.log(`  memory:  ${info.memCount} (long_term)`);
  console.log(`  skills:  ${info.skillNames}`);
  console.log(`  data:    ${info.dataDir}`);
  console.log("----------------------------------------");
  console.log("  命令:");
  console.log("    /status            显示运行概况 (LLM/Token/Memory)");
  console.log("    /config            显示系统当前配置");
  console.log("    /theme <名称>      切换配色 (hachimi-dark, cyberpunk, monokai)");
  console.log("    /help              帮助与快捷键");
  console.log("    /memories          查看记忆");
  console.log("    /remember <内容>   添加记忆");
  console.log("    /sessions          列出与切换历史会话 (/session load <id>)");
  console.log("    /clear             清空当前会话消息");
  console.log("    /exit              保存并退出");
  console.log(colorize("========================================\n", theme.colors.primary));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
