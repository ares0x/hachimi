// apps/tui/src/ui/app.ts
import { createCliRenderer, Box, Text, Input } from "@opentui/core";
import { generateId } from "@hachimi/shared";
import type { AppContext } from "../app-context.js";
import { handleSlashCommand } from "./commands.js";
import { renderModalBox } from "./modal.js";
import { defaultTheme } from "./theme.js";

export interface OpenTUIAppOptions {
  ctx: AppContext;
  useFallbackReadline?: boolean;
}

export class HachimiTUIApp {
  private ctx: AppContext;

  constructor(options: OpenTUIAppOptions) {
    this.ctx = options.ctx;
  }

  async start() {
    const status = this.ctx.getStatus();

    console.log("=========================================");
    console.log(` 🐱 ${status.title}  |  OpenTUI Fullscreen`);
    console.log("=========================================");
    console.log(`  Model    : ${status.llm.provider} (${status.llm.model})`);
    console.log(`  Session  : ${status.session.id}`);
    console.log(`  Context  : ${status.context.mode} (Max: ${status.context.maxTokens})`);
    console.log(`  Memory   : ${status.memory.longTermCount} (long_term)`);
    console.log(`  Skills   : ${status.skills.join(", ") || "无"}`);
    console.log("-----------------------------------------");
    console.log("  输入 /help 查看全量命令与快捷键");
    console.log("  输入 /status 查看运行概况");
    console.log("  输入 /config 查看详细配置");
    console.log("=========================================\n");

    try {
      const renderer = await createCliRenderer();

      // 构建全屏主框架容器
      const headerBox = Box({
        flexDirection: "column",
        borderStyle: "single",
        borderColor: defaultTheme.colors.primary,
        padding: 1,
      });

      const headerText = Text({
        content: `🐱 ${status.title} | LLM: ${status.llm.provider} (${status.llm.model}) | Session: ${status.session.id}`,
        fg: defaultTheme.colors.primary,
      });
      headerBox.add(headerText);

      renderer.root.add(headerBox);

      // 如果能在特定终端正常完成初始化，保持渲染
      logNotice("OpenTUI 全屏沉浸式引擎渲染成功！");
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      logNotice(`环境未开启全屏 TTY 或平台兼容限制 (${errMsg})，自动保持在交互式平滑模式。`);
    }
  }
}

function logNotice(msg: string) {
  console.log(`[TUI Engine] ${msg}`);
}
