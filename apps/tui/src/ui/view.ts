// apps/tui/src/ui/view.ts
import * as readline from "node:readline";
import { getActiveTheme, colorize, getDisplayWidth, padDisplayWidth, bold, dim, renderBadge } from "./theme.js";
import { SLASH_COMMANDS } from "./commands.js";
import { renderSelectorModalBox, type SelectorItem } from "./modal.js";

const HACHIMI_ASCII_LOGO = [
  "   /\\_/\\   ",
  "  ( o.o )  ",
  "   > ^ <   ",
  "  /     \\  ",
  " (       ) ",
  "  `-----'  ",
];

export function enterFullscreenCanvas() {
  process.stdout.write("\x1b[?1049h\x1b[H");
}

export function exitFullscreenCanvas() {
  process.stdout.write("\x1b[?1049l");
}

export function clearTerminalCanvas() {
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
    { label: "Config & status", shortcut: "ctrl+p" },
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

export function renderToolTimeline(
  toolName: string,
  args: Record<string, unknown>,
  status: "start" | "end",
  result?: string,
  durationMs?: number,
  success: boolean = true
): string {
  const theme = getActiveTheme();
  const argsStr = JSON.stringify(args);
  const toolBadge = renderBadge("🛠️ TOOL", theme.colors.toolRole, "#FFFFFF");

  if (status === "start") {
    return [
      `${toolBadge} ${bold(colorize(toolName, theme.colors.primary))} (${dim(argsStr)})`,
      ` ├── ⏳ ${colorize("状态: 执行中...", theme.colors.warning)}`,
    ].join("\n");
  }

  const durationStr = durationMs !== undefined ? `${durationMs}ms` : "";
  const statusIcon = success ? "✅" : "❌";
  const resPreview = (result || "").trim().split("\n")[0] || "完成";
  const truncatedRes = resPreview.length > 50 ? resPreview.substring(0, 47) + "..." : resPreview;

  return ` └── ${statusIcon} ${colorize(`完成 (${durationStr})`, success ? theme.colors.success : theme.colors.error)}: ${dim(truncatedRes)}`;
}

export function askInteractiveSelector(
  title: string,
  items: SelectorItem[]
): Promise<SelectorItem | null> {
  return new Promise((resolve) => {
    let selectedIndex = 0;
    let printedLines = 0;

    const render = () => {
      const modalStr = renderSelectorModalBox({
        title,
        items,
        selectedIndex,
      });

      if (printedLines > 0) {
        process.stdout.write(`\r\x1b[${printedLines}A\x1b[J`);
      }

      const lines = modalStr.split("\n");
      process.stdout.write(modalStr + "\n");
      printedLines = lines.length;
    };

    const onKey = (char: string, key: any) => {
      const isUp = key?.name === "up" || key?.name === "k" || char === "\x1b[A";
      const isDown = key?.name === "down" || key?.name === "j" || char === "\x1b[B";
      const isEnter = key?.name === "return" || key?.name === "enter" || char === "\r" || char === "\n";
      const isEsc = key?.name === "escape" || key?.name === "q" || char === "\x1b";

      if (isUp) {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        render();
        return;
      }
      if (isDown) {
        selectedIndex = (selectedIndex + 1) % items.length;
        render();
        return;
      }
      if (isEnter) {
        cleanup();
        resolve(items[selectedIndex]);
        return;
      }
      if (isEsc) {
        cleanup();
        resolve(null);
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
      if (printedLines > 0) {
        process.stdout.write(`\r\x1b[${printedLines}A\x1b[J`);
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

    render();
  });
}

/** 交互式命令行输入框，支持中文全角字符精准光标对齐与编辑 */
export function askInteractivePrompt(promptLabel: string): Promise<string> {
  return new Promise((resolve) => {
    let inputBuf = "";
    let cursorPos = 0;

    const renderPromptLine = () => {
      const theme = getActiveTheme();

      // 清除当前整行并渲染 Prompt Label 与用户输入
      process.stdout.write(`\r\x1b[K${promptLabel}${colorize(inputBuf, theme.colors.text)}`);

      // 当输入以 / 开头且光标位于末尾时，渲染 Fish / Grok 幽灵补全提示
      let ghostLen = 0;
      if (inputBuf.trim().startsWith("/") && cursorPos === inputBuf.length) {
        const filter = inputBuf.trim().toLowerCase();
        const matches = SLASH_COMMANDS.filter((c) => c.name.startsWith(filter));
        if (matches.length > 0) {
          const match = matches[0];
          const matchedName = match.name;
          const typedLen = inputBuf.trim().length;

          const ghostSuffix = matchedName.substring(typedLen);
          const descHint = `  ${dim(`(按 Tab 补全: ${match.description})`)}`;
          const ghostText = dim(ghostSuffix) + descHint;
          ghostLen = getDisplayWidth(ghostSuffix + descHint);

          process.stdout.write(ghostText);
        }
      }

      // 将终端实际光标计算全角字符列宽后精确归位回 cursorPos 位置
      const remainingText = inputBuf.substring(cursorPos);
      const backDistance = getDisplayWidth(remainingText) + ghostLen;
      if (backDistance > 0) {
        process.stdout.write(`\x1b[${backDistance}D`);
      }
    };

    const onKey = (char: string, key: any) => {
      // 快捷键 1: Ctrl+Q / Ctrl+C -> 退出程序
      if (key && key.ctrl && (key.name === "q" || key.name === "c")) {
        cleanup();
        process.stdout.write("\x1b[K\n");
        resolve("/exit");
        return;
      }

      // 快捷键 2: Ctrl+W -> 新建会话
      if (key && key.ctrl && key.name === "w") {
        cleanup();
        process.stdout.write("\x1b[K\n");
        resolve("/session create");
        return;
      }

      // 快捷键 3: Ctrl+S -> 恢复历史会话
      if (key && key.ctrl && key.name === "s") {
        cleanup();
        process.stdout.write("\x1b[K\n");
        resolve("/sessions");
        return;
      }

      // 快捷键 4: Ctrl+P -> 查看配置与系统状态
      if (key && key.ctrl && key.name === "p") {
        cleanup();
        process.stdout.write("\x1b[K\n");
        resolve("/status");
        return;
      }

      // 回车提交
      if (key && (key.name === "return" || key.name === "enter" || char === "\r" || char === "\n")) {
        cleanup();
        process.stdout.write("\x1b[K\n");
        resolve(inputBuf.trim());
        return;
      }

      // 左右移动光标与 Tab 补全
      const isLeft = key?.name === "left" || char === "\x1b[D";
      const isRight = key?.name === "right" || char === "\x1b[C";
      const isHome = key?.name === "home" || (key?.ctrl && key?.name === "a");
      const isEnd = key?.name === "end" || (key?.ctrl && key?.name === "e");

      if (isLeft) {
        cursorPos = Math.max(0, cursorPos - 1);
        renderPromptLine();
        return;
      }

      if (isRight) {
        if (cursorPos < inputBuf.length) {
          cursorPos++;
        } else if (inputBuf.trim().startsWith("/")) {
          const filter = inputBuf.trim().toLowerCase();
          const matches = SLASH_COMMANDS.filter((c) => c.name.startsWith(filter));
          if (matches.length > 0) {
            inputBuf = matches[0].name + " ";
            cursorPos = inputBuf.length;
          }
        }
        renderPromptLine();
        return;
      }

      if (isHome) {
        cursorPos = 0;
        renderPromptLine();
        return;
      }

      if (isEnd) {
        cursorPos = inputBuf.length;
        renderPromptLine();
        return;
      }

      if (key && key.name === "tab") {
        if (inputBuf.trim().startsWith("/")) {
          const filter = inputBuf.trim().toLowerCase();
          const matches = SLASH_COMMANDS.filter((c) => c.name.startsWith(filter));
          if (matches.length > 0) {
            inputBuf = matches[0].name + " ";
            cursorPos = inputBuf.length;
          }
        }
        renderPromptLine();
        return;
      }

      // 退格 Backspace (删除光标左侧字符)
      if (key && key.name === "backspace") {
        if (cursorPos > 0) {
          inputBuf = inputBuf.slice(0, cursorPos - 1) + inputBuf.slice(cursorPos);
          cursorPos--;
        }
        renderPromptLine();
        return;
      }

      // 删除键 Delete (删除光标右侧字符)
      if (key && key.name === "delete") {
        if (cursorPos < inputBuf.length) {
          inputBuf = inputBuf.slice(0, cursorPos) + inputBuf.slice(cursorPos + 1);
        }
        renderPromptLine();
        return;
      }

      // 普通字符插入
      if (char && char.length === 1 && char.charCodeAt(0) >= 32) {
        inputBuf = inputBuf.slice(0, cursorPos) + char + inputBuf.slice(cursorPos);
        cursorPos++;
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
