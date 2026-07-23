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
    border: "#45475A",
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
    border: "#75715E",
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
