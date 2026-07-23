// apps/tui/src/ui/theme.ts
/**
 * TUI 主题与设计规范（借鉴 Pi & Grok-build 风格）
 */

export interface UITheme {
  name: string;
  colors: {
    primary: string;       // 主色调（如亮青/紫）
    secondary: string;     // 次要色调
    background: string;    // 背景色
    panelBg: string;       // 弹出框/面板背景
    border: string;        // 边框颜色
    text: string;          // 主文本
    subtext: string;       // 次要/灰度文本
    userRole: string;      // 用户消息颜色
    assistantRole: string; // 助手消息颜色
    systemRole: string;    // 系统/提示颜色
    toolRole: string;      // 工具调用/返回颜色
    success: string;       // 成功状态
    warning: string;       // 警告状态
    error: string;         // 错误状态
  };
}

export const darkTheme: UITheme = {
  name: "hachimi-dark",
  colors: {
    primary: "#00E5FF",      // 亮天蓝 / Cyan
    secondary: "#7C4DFF",    // 紫色 Accent
    background: "#121212",
    panelBg: "#1E1E2E",
    border: "#00E5FF",
    text: "#CDD6F4",
    subtext: "#A6ADC8",
    userRole: "#89B4FA",     // 淡蓝
    assistantRole: "#A6E3A1", // 柔和绿
    systemRole: "#F9E2AF",   // 淡黄
    toolRole: "#BAC2DE",     // 柔和灰
    success: "#A6E3A1",
    warning: "#FAB387",
    error: "#F38BA8",
  },
};

export const cyberpunkTheme: UITheme = {
  name: "cyberpunk",
  colors: {
    primary: "#FF007F",      // 赛博粉
    secondary: "#00F0FF",    // 霓虹青
    background: "#0D0221",
    panelBg: "#190938",
    border: "#FF007F",
    text: "#00F0FF",
    subtext: "#7000FF",
    userRole: "#00F0FF",
    assistantRole: "#FF007F",
    systemRole: "#FFE600",
    toolRole: "#00FF66",
    success: "#00FF66",
    warning: "#FFE600",
    error: "#FF0055",
  },
};

export const monokaiTheme: UITheme = {
  name: "monokai",
  colors: {
    primary: "#A6E22E",      // Monokai 绿
    secondary: "#F92672",    // Monokai 洋红
    background: "#272822",
    panelBg: "#3E3D32",
    border: "#A6E22E",
    text: "#F8F8F2",
    subtext: "#75715E",
    userRole: "#66D9EF",     // 浅蓝
    assistantRole: "#A6E22E", // 绿
    systemRole: "#E6DB74",   // 黄
    toolRole: "#FD971F",     // 橙
    success: "#A6E22E",
    warning: "#FD971F",
    error: "#F92672",
  },
};

export const THEMES: Record<string, UITheme> = {
  "hachimi-dark": darkTheme,
  "cyberpunk": cyberpunkTheme,
  "monokai": monokaiTheme,
};

let currentTheme = darkTheme;

export function getActiveTheme(): UITheme {
  return currentTheme;
}

export function setActiveTheme(name: string): boolean {
  if (THEMES[name]) {
    currentTheme = THEMES[name];
    return true;
  }
  return false;
}

export const defaultTheme = darkTheme;

/**
 * 将 Hex 颜色转化为 Terminal 24-bit ANSI TrueColor Escape Code
 */
export function colorize(text: string, hexColor?: string): string {
  if (!hexColor) return text;
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return text;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

/**
 * 计算终端文本实际占用宽度（兼容 CJK 东亚全角字符与 Emoji 2 列宽）
 */
export function getDisplayWidth(str: string): number {
  const clean = str.replace(/\x1b\[[0-9;]*m/g, "");
  let width = 0;
  for (const char of clean) {
    const code = char.codePointAt(0) || 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x1f300 && code <= 0x1f9ff) ||
      (code >= 0x2600 && code <= 0x26ff)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * 按真实终端显示宽度补充空格对齐
 */
export function padDisplayWidth(str: string, targetWidth: number): string {
  const currentWidth = getDisplayWidth(str);
  const padding = Math.max(0, targetWidth - currentWidth);
  return str + " ".repeat(padding);
}
