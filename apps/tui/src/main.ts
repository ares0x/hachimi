// apps/tui/src/main.ts
/**
 * Hachimi TUI 增强与沉浸式交互入口
 */

import { generateId } from "@hachimi/shared";
import type { Message } from "../../../packages/core/src/types/index.js";
import { createAppContext } from "./app-context.js";
import { handleSlashCommand } from "./ui/commands.js";
import { renderModalBox } from "./ui/modal.js";
import { HachimiTUIApp } from "./ui/app.js";
import { getActiveTheme, setActiveTheme, colorize, renderBadge, bold, dim } from "./ui/theme.js";
import {
  clearTerminalCanvas,
  enterFullscreenCanvas,
  exitFullscreenCanvas,
  renderWelcomeCard,
  renderToolTimeline,
  askInteractiveSelector,
  askInteractivePrompt,
} from "./ui/view.js";

async function main() {
  const ctx = createAppContext({
    async onToolApproval(toolName, args, permission) {
      const theme = getActiveTheme();
      const badge = renderBadge("⚠️ APPROVAL REQUIRED", theme.colors.warning, "#FFFFFF");
      console.log(`\n${badge} ${bold(`工具 [${toolName}] (${permission}) 试图执行`)}`);
      console.log(dim(`   参数: ${JSON.stringify(args)}`));

      const promptStr = colorize("👉 是否允许执行该工具？(y/N): ", theme.colors.primary);
      const ans = (await askInteractivePrompt(`   ${promptStr}`)).trim().toLowerCase();

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
  }

  // 开启终端 Alt Buffer 备用缓冲区，进入 1:1 全屏沉浸 TUI Canvas 模式
  enterFullscreenCanvas();
  clearTerminalCanvas();
  const status = ctx.getStatus();
  console.log(renderWelcomeCard(status));

  // 确保退出时清理并还原用户的终端全屏
  process.on("exit", () => {
    exitFullscreenCanvas();
  });
  process.on("SIGINT", () => {
    exitFullscreenCanvas();
    process.exit(0);
  });

  while (true) {
    let userInput = "";
    const theme = getActiveTheme();

    try {
      const promptLabel = colorize("❯ ", theme.colors.primary);
      userInput = (await askInteractivePrompt(promptLabel)).trim();
    } catch {
      break;
    }

    if (!userInput) continue;

    try {
      // 统一 Slash 命令分发（包括单输入 '/' 的全量命令提示菜单）
      const res = await handleSlashCommand(userInput, ctx);

      if (res.action === "exit") {
        console.log(dim(res.content || "再见！"));
        break;
      }

      if (res.action === "clear") {
        clearTerminalCanvas();
        console.log(renderWelcomeCard(ctx.getStatus()));
        console.log(colorize(res.content || "当前会话已重置", theme.colors.success));
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

      if (res.action === "selector_theme") {
        const themeItems = [
          { id: "default", label: "default", sublabel: "Grok 经典深色 (TokyoNight)" },
          { id: "amber", label: "amber", sublabel: "暖金琥珀" },
          { id: "neon", label: "neon", sublabel: "午夜霓虹" },
        ];
        const selected = await askInteractiveSelector("🎨 选择界面主题", themeItems);
        if (selected) {
          setActiveTheme(selected.id);
          console.log(colorize(`✨ 主题已成功切换为: [${selected.id}]`, getActiveTheme().colors.success));
        }
        continue;
      }

      if (res.action === "selector_sessions") {
        const currentId = sessions.getCurrent()?.id;
        const sessionList = sessions.list();
        const sessionItems = sessionList.map((s) => ({
          id: s.id,
          label: `${s.title || "默认会话"} [${s.id}]`,
          sublabel: s.id === currentId ? "👈 当前激活" : new Date(s.updatedAt).toLocaleTimeString(),
        }));

        if (sessionItems.length === 0) {
          console.log(colorize("（暂无历史会话，按 Ctrl+W 新建）", theme.colors.subtext));
          continue;
        }

        const selected = await askInteractiveSelector("💬 选择切换历史会话", sessionItems);
        if (selected) {
          const loaded = sessions.load(selected.id);
          if (loaded) {
            console.log(colorize(`✅ 已成功切换到会话: [${loaded.id}] (${loaded.title || "默认会话"})`, theme.colors.success));
          }
        }
        continue;
      }

      // 正常对话响应 + 思考 Spinner + 工具时间线 + 流式打字输出
      const spinner = colorize("⠋ [Hachimi 思考中...]", theme.colors.warning);
      process.stdout.write(`${spinner}\r`);

      let hasStreamStarted = false;
      const history = sessions.getHistory();
      const reply = await agent.run(userInput, history, {
        onChunk: (chunk: string) => {
          if (!hasStreamStarted) {
            hasStreamStarted = true;
            // 首字到达，擦除思考 Spinner 提示行
            process.stdout.write(" ".repeat(40) + "\r");
            const botBadge = renderBadge("🤖 HACHIMI", theme.colors.assistantRole, "#FFFFFF");
            process.stdout.write(`${botBadge} `);
          }
          process.stdout.write(chunk);
        },
        onToolStart: (name, args) => {
          if (!hasStreamStarted) {
            process.stdout.write(" ".repeat(40) + "\r");
          }
          console.log(renderToolTimeline(name, args, "start"));
        },
        onToolEnd: (name, result, durationMs, success) => {
          console.log(renderToolTimeline(name, {}, "end", result, durationMs, success));
        },
      });

      if (!hasStreamStarted) {
        // 若未触发 Chunk 打印（例如某些硬编码工具回复），兜底擦除 Spinner
        process.stdout.write(" ".repeat(40) + "\r");
        const botBadge = renderBadge("🤖 HACHIMI", theme.colors.assistantRole, "#FFFFFF");
        console.log(`${botBadge} ${reply}`);
      } else {
        process.stdout.write("\n");
      }

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

  // 退出全屏并归位还原终端
  exitFullscreenCanvas();
  process.exit(0);
}

main().catch((err) => {
  exitFullscreenCanvas();
  console.error(err);
  process.exit(1);
});
