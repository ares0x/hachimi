// apps/tui/src/ui/view.ts
import * as readline from "node:readline";
import { getActiveTheme, colorize, getDisplayWidth, padDisplayWidth, bold, dim } from "./theme.js";
import { SLASH_COMMANDS } from "./commands.js";

const HACHIMI_ASCII_LOGO = [
  "   /\\_/\\   ",
  "  ( o.o )  ",
  "   > ^ <   ",
  "  /     \\  ",
  " (       ) ",
  "  `-----'  ",
];

/** 进入终端 Alt Buffer 备用屏幕缓冲区（全屏沉浸模式） */
export function enterFullscreenCanvas() {
  process.stdout.write("\x1b[?1049h\x1b[H");
}

/** 退出终端 Alt Buffer 并完美还原原终端窗口 */
export function exitFullscreenCanvas() {
  process.stdout.write("\x1b[?1049l");
}

export function clearTerminalCanvas() {
  // ANSI 标准清屏归位
  process.stdout.write("\x1b[2J\x1b[H");
}

export function renderWelcomeCard(status: any): string {
  const theme = getActiveTheme();
  const width = 76;

  const cardTitle = bold(colorize("Hachimi Assistant", theme.colors.primary)) + " " + dim("v0.1.0");
  const subText = colorize("Personal AI Assistant Harness for TypeScript & Node.", theme.colors.text);
  const statusBadge = colorize(`[${status.llm.provider} (${status.llm.model})]`, theme.colors.warning) + " " + dim("ready for tasks.");

  const menuItems = [
    { label: "New session", shortcut: "ctrl+w" },
    { label: "Resume session", shortcut: "ctrl+s" },
    { label: "Config & status", shortcut: "ctrl+c" },
    { label: "Quit", shortcut: "ctrl+q" },
  ];

  const lines: string[] = [];

  lines.push(colorize(`┌${"─".repeat(width - 2)}┐`, theme.colors.border));
  lines.push(colorize(`│${" ".repeat(width - 2)}│`, theme.colors.border));

  for (let i = 0; i < 6; i++) {
    const logoLine = colorize(HACHIMI_ASCII_LOGO[i], theme.colors.primary);
    let rightContent = "";

    if (i === 0) rightContent = cardTitle;
    else if (i === 1) rightContent = subText;
    else if (i === 2) rightContent = statusBadge;
    else if (i >= 3 && i - 3 < menuItems.length) {
      const item = menuItems[i - 3];
      const leftPart = colorize(item.label, theme.colors.text);
      const rightPart = dim(item.shortcut);
      const space = Math.max(0, 48 - getDisplayWidth(leftPart) - getDisplayWidth(rightPart));
      rightContent = `${leftPart}${" ".repeat(space)}${rightPart}`;
    }

    const lineBody = `  ${logoLine}   ${rightContent}`;
    const padded = padDisplayWidth(lineBody, width - 4);
    lines.push(`${colorize("│", theme.colors.border)} ${padded} ${colorize("│", theme.colors.border)}`);
  }

  lines.push(colorize(`│${" ".repeat(width - 2)}│`, theme.colors.border));
  lines.push(colorize(`└${"─".repeat(width - 2)}┘`, theme.colors.border));

  return lines.join("\n");
}

export function askInteractivePrompt(promptLabel: string): Promise<string> {
  return new Promise((resolve) => {
    let inputBuf = "";

    const renderPromptLine = () => {
      const theme = getActiveTheme();

      // 清除当前整行，重绘 Prompt 与已知用户输入
      process.stdout.write(`\r\x1b[K${promptLabel}${colorize(inputBuf, theme.colors.text)}`);

      // 当输入以 / 开头时，渲染 Fish / Grok 风格的单行幽灵补全提示 (Ghost Auto-suggestion)
      if (inputBuf.trim().startsWith("/")) {
        const filter = inputBuf.trim().toLowerCase();
        const matches = SLASH_COMMANDS.filter((c) => c.name.startsWith(filter));
        if (matches.length > 0) {
          const match = matches[0];
          const matchedName = match.name;
          const typedLen = inputBuf.trim().length;

          const ghostSuffix = matchedName.substring(typedLen);
          const descHint = `  ${dim(`(按 Tab 补全: ${match.description})`)}`;

          const ghostText = dim(ghostSuffix) + descHint;

          // 写入 Ghost 提示 -> 恢复光标回到真实输入末尾
          process.stdout.write(`\x1b[s${ghostText}\x1b[u`);
        }
      }
    };

    const onKey = (char: string, key: any) => {
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        exitFullscreenCanvas();
        process.exit(0);
      }

      if (key && (key.name === "return" || key.name === "enter")) {
        cleanup();
        process.stdout.write("\x1b[K\n");
        resolve(inputBuf.trim());
        return;
      }

      if (key && (key.name === "tab" || key.name === "right")) {
        if (inputBuf.trim().startsWith("/")) {
          const filter = inputBuf.trim().toLowerCase();
          const matches = SLASH_COMMANDS.filter((c) => c.name.startsWith(filter));
          if (matches.length > 0) {
            inputBuf = matches[0].name + " ";
          }
        }
        renderPromptLine();
        return;
      }

      if (key && key.name === "backspace") {
        inputBuf = inputBuf.slice(0, -1);
        renderPromptLine();
        return;
      }

      if (char && char.length === 1 && char.charCodeAt(0) >= 32) {
        inputBuf += char;
        renderPromptLine();
        return;
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKey);
      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(false);
        } catch {
          /* ignore */
        }
      }
    };

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(true);
      } catch {
        /* ignore */
      }
    }
    process.stdin.on("keypress", onKey);

    renderPromptLine();
  });
}
