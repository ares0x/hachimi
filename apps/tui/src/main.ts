// apps/tui/src/main.ts
/**
 * Hachimi TUI 增强与沉浸式交互入口 (Grok-build 主题审美升级)
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { generateId } from "@hachimi/shared";
import type { Message } from "../../../packages/core/src/types/index.js";
import { createAppContext } from "./app-context.js";
import { handleSlashCommand, SLASH_COMMANDS } from "./ui/commands.js";
import { renderModalBox } from "./ui/modal.js";
import { HachimiTUIApp } from "./ui/app.js";
import { getActiveTheme, colorize, renderBadge, bold, dim } from "./ui/theme.js";

async function main() {
  let rl!: readline.Interface;

  const ctx = createAppContext({
    async onToolApproval(toolName, args, permission) {
      const theme = getActiveTheme();
      const badge = renderBadge("⚠️ APPROVAL REQUIRED", theme.colors.warning, "#000000");
      console.log(`\n${badge} ${bold(`工具 [${toolName}] (${permission}) 试图执行`)}`);
      console.log(dim(`   参数: ${JSON.stringify(args)}`));

      const promptStr = colorize("👉 是否允许执行该工具？(y/N): ", theme.colors.primary);
      const ans = (await rl.question(`   ${promptStr}`)).trim().toLowerCase();

      const approved = ans === "y" || ans === "yes";
      if (approved) {
        console.log(colorize("   ✅ 已授权执行", theme.colors.success));
      } else {
        console.log(colorize("   ❌ 已拒绝执行", theme.colors.error));
      }
      return approved;
    },
  });

  const { sessions, agent } = ctx;

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
    const userBadge = renderBadge("👤 YOU", theme.colors.userRole, "#000000");

    try {
      userInput = (await rl.question(`\n${userBadge} `)).trim();
    } catch {
      break;
    }

    if (!userInput) continue;

    try {
      // 统一 Slash 命令分发
      const res = await handleSlashCommand(userInput, ctx);

      if (res.action === "exit") {
        console.log(dim(res.content || "再见！"));
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

      const botBadge = renderBadge("🤖 HACHIMI", theme.colors.assistantRole, "#000000");
      console.log(`${botBadge} ${colorize(reply, theme.colors.text)}`);

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
  const bannerHeader = renderBadge(` 🐱 ${info.title} `, theme.colors.primary, "#000000");
  console.log(`\n${bannerHeader} ${dim("Grok-build Engine")}`);
  console.log(colorize("─".repeat(50), theme.colors.border));
  console.log(`  ${bold("Model")}    : ${colorize(info.provider, theme.colors.primary)}`);
  console.log(`  ${bold("Session")}  : ${dim(info.sessionId)}`);
  console.log(`  ${bold("Memory")}   : ${info.memCount} entries (long_term)`);
  console.log(`  ${bold("Skills")}   : ${info.skillNames}`);
  console.log(`  ${bold("DataDir")}  : ${info.dataDir}`);
  console.log(colorize("─".repeat(50), theme.colors.border));
  console.log(dim("  输入 /help 查看命令与快捷指南 | /status 查看概况仪表 | /theme 切换主题"));
  console.log(colorize("─".repeat(50), theme.colors.border) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
