// apps/tui/src/ui/modal.ts
import {
  getActiveTheme,
  colorize,
  getDisplayWidth,
  padDisplayWidth,
  bold,
  dim,
  type UITheme,
} from "./theme.js";

export interface ModalOptions {
  title: string;
  content: string;
  theme?: UITheme;
  width?: number;
}

export interface SelectorItem {
  id: string;
  label: string;
  sublabel?: string;
}

export interface SelectorModalOptions {
  title: string;
  items: SelectorItem[];
  selectedIndex: number;
  theme?: UITheme;
  width?: number;
}

export function renderModalBox(options: ModalOptions): string {
  const theme = options.theme || getActiveTheme();
  const { title, content, width = 72 } = options;
  const lines = content.split("\n");

  const titleDispWidth = getDisplayWidth(title);
  const titlePadLen = Math.max(0, width - titleDispWidth - 4);
  const borderTopStr = `┌──${title}─${"─".repeat(titlePadLen)}┐`;
  const borderBottomStr = `└${"─".repeat(width - 2)}┘`;
  const hintStr = ` [按 Esc 或 q 关闭] `;

  const coloredBorderTop = colorize(borderTopStr, theme.colors.border);
  const coloredBorderBottom = colorize(borderBottomStr, theme.colors.border);
  const coloredSide = colorize("│", theme.colors.border);

  const paddedLines = lines.map((line) => {
    let textStr = line;
    const dispW = getDisplayWidth(textStr);
    if (dispW > width - 4) {
      textStr = textStr.substring(0, width - 7) + "...";
    }
    const padded = padDisplayWidth(textStr, width - 4);
    return `${coloredSide} ${colorize(padded, theme.colors.text)} ${coloredSide}`;
  });

  const hintPadded = padDisplayWidth(hintStr, width - 4);
  const hintLine = `${coloredSide} ${colorize(hintPadded, theme.colors.subtext)} ${coloredSide}`;

  return [coloredBorderTop, ...paddedLines, hintLine, coloredBorderBottom].join("\n");
}

export function renderSelectorModalBox(options: SelectorModalOptions): string {
  const theme = options.theme || getActiveTheme();
  const { title, items, selectedIndex, width = 72 } = options;

  const titleDispWidth = getDisplayWidth(title);
  const titlePadLen = Math.max(0, width - titleDispWidth - 4);
  const borderTopStr = `┌──${title}─${"─".repeat(titlePadLen)}┐`;
  const borderBottomStr = `└${"─".repeat(width - 2)}┘`;
  const hintStr = ` [↑/↓ 移动光标 | Enter 选择 | Esc 取消] `;

  const coloredBorderTop = colorize(borderTopStr, theme.colors.primary);
  const coloredBorderBottom = colorize(borderBottomStr, theme.colors.primary);
  const coloredSide = colorize("│", theme.colors.primary);

  const paddedLines = items.map((item, idx) => {
    const isSelected = idx === selectedIndex;
    const prefix = isSelected ? "▶ " : "  ";
    const labelStr = isSelected
      ? bold(colorize(item.label, theme.colors.primary))
      : colorize(item.label, theme.colors.text);
    const subStr = item.sublabel ? dim(` (${item.sublabel})`) : "";
    const lineBody = `${prefix}${labelStr}${subStr}`;
    const padded = padDisplayWidth(lineBody, width - 4);
    return `${coloredSide} ${padded} ${coloredSide}`;
  });

  const hintPadded = padDisplayWidth(hintStr, width - 4);
  const hintLine = `${coloredSide} ${colorize(hintPadded, theme.colors.subtext)} ${coloredSide}`;

  return [coloredBorderTop, ...paddedLines, hintLine, coloredBorderBottom].join("\n");
}
