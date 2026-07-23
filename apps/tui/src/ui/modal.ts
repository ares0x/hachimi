// apps/tui/src/ui/modal.ts
import { getActiveTheme, colorize, getDisplayWidth, padDisplayWidth, type UITheme } from "./theme.js";

export interface ModalOptions {
  title: string;
  content: string;
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

  return [
    "",
    coloredBorderTop,
    ...paddedLines,
    hintLine,
    coloredBorderBottom,
    "",
  ].join("\n");
}
