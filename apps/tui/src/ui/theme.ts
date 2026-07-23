// apps/tui/src/ui/theme.ts
/**
 * Hachimi TUI 界面主题与 ANSI 动态渲染引擎
 * 默认主题与配色精确对齐 Grok Build 官方开源调色盘 (GrokNight: Neutral Gray + TokyoNight Accents)
 * 采用原生自适应 Terminal 透明背景，适配亮色与暗色终端
 */

export interface UITheme {
  name: string;
  label: string;
  colors: {
    primary: string;       // 主色调（TokyoNight Blue #7AA2F7）
    secondary: string;     // 次要 Accent 调（TokyoNight Magenta #BB9AF7）
    background: string;    // 背景色（留空继承终端原生背景，防止打块色斑）
    panelBg: string;       // 弹出框/面板背景
    border: string;        // 边框颜色（#505058）
    text: string;          // 主文本 (留空指代终端默认前景色)
    subtext: string;       // 次要/灰度文本 (#787878)
    userRole: string;      // 用户消息颜色 (#C8C8C8)
    assistantRole: string; // 助手消息颜色 (#BB9AF7)
    systemRole: string;    // 系统/提示颜色 (#7AA2F7)
    toolRole: string;      // 工具调用/返回颜色 (#73DACA)
    success: string;       // 成功状态 (#9ECE6A)
    warning: string;       // 警告状态 (#E0AF68)
    error: string;         // 错误状态 (#F7768E)
  };
}

/** Default Theme (精确对齐 Grok Build 官方 GrokNight 配色方案) */
export const defaultTheme: UITheme = {
  name: "default",
  label: "Hachimi Default (Grok 经典)",
  colors: {
    primary: "#0284C7",       // 高对比 TokyoNight Blue (亮/暗终端均清晰)
    secondary: "#BB9AF7",     // TokyoNight Magenta
    background: "",           // 留空自适应终端原生背景
    panelBg: "",
    border: "#0284C7",        // 高对比 Accent 边框
    text: "",                 // 留空继承终端原生黑/白文字
    subtext: "#64748B",       // 石板灰
    userRole: "#0284C7",      // User Accent Blue
    assistantRole: "#BB9AF7", // Assistant Purple
    systemRole: "#0284C7",    // System Blue
    toolRole: "#73DACA",      // Teal Tool
    success: "#059669",       // TokyoNight Green
    warning: "#D97706",       // TokyoNight Amber
    error: "#DC2626",         // TokyoNight Red
  },
};

export const slateTheme = defaultTheme;

/** Amber (暖金琥珀) */
export const amberTheme: UITheme = {
  name: "amber",
  label: "Hachimi Amber (暖金琥珀)",
  colors: {
    primary: "#D97706",      // 亮琥珀
    secondary: "#FF9E64",    // 暖红橙
    background: "",
    panelBg: "",
    border: "#D97706",
    text: "",
    subtext: "#787878",
    userRole: "#D97706",
    assistantRole: "#059669",
    systemRole: "#D97706",
    toolRole: "#FF9E64",
    success: "#059669",
    warning: "#D97706",
    error: "#DC2626",
  },
};

/** Neon (午夜霓虹) */
export const neonTheme: UITheme = {
  name: "neon",
  label: "Hachimi Neon (午夜霓虹)",
  colors: {
    primary: "#BB9AF7",      // 电光紫
    secondary: "#7DCFFF",    // 霓虹青
    background: "",
    panelBg: "",
    border: "#BB9AF7",
    text: "",
    subtext: "#787878",
    userRole: "#0284C7",
    assistantRole: "#BB9AF7",
    systemRole: "#D97706",
    toolRole: "#7DCFFF",
    success: "#059669",
    warning: "#D97706",
    error: "#DC2626",
  },
};

export const THEMES: Record<string, UITheme> = {
  "default": defaultTheme,
  "amber": amberTheme,
  "neon": neonTheme,
};

let currentTheme = defaultTheme;

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

// ==================== ANSI 格式化与样式库 ====================

/** 前景色 ANSI 转换 (24-bit TrueColor) */
export function colorize(text: string, hexColor?: string): string {
  if (!hexColor) return text;
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return text;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

/** 背景色 ANSI 转换 (24-bit TrueColor) */
export function colorizeBg(text: string, hexBgColor?: string, hexFgColor?: string): string {
  if (!hexBgColor) return text;
  const bgHex = hexBgColor.replace("#", "");
  const br = parseInt(bgHex.substring(0, 2), 16);
  const bg = parseInt(bgHex.substring(2, 4), 16);
  const bb = parseInt(bgHex.substring(4, 6), 16);
  if (isNaN(br) || isNaN(bg) || isNaN(bb)) return text;

  let fgSeq = "";
  if (hexFgColor) {
    const fgHex = hexFgColor.replace("#", "");
    const fr = parseInt(fgHex.substring(0, 2), 16);
    const fg = parseInt(fgHex.substring(2, 4), 16);
    const fb = parseInt(fgHex.substring(4, 6), 16);
    if (!isNaN(fr) && !isNaN(fg) && !isNaN(fb)) {
      fgSeq = `\x1b[38;2;${fr};${fg};${fb}m`;
    }
  }

  return `\x1b[48;2;${br};${bg};${bb}m${fgSeq}${text}\x1b[0m`;
}

/** 加粗文本 */
export function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

/** 暗淡文本 */
export function dim(text: string): string {
  return `\x1b[2m${text}\x1b[22m`;
}

/** 斜体文本 */
export function italic(text: string): string {
  return `\x1b[3m${text}\x1b[23m`;
}

/** Pill Badge 胶囊徽章 */
export function renderBadge(label: string, bgHex: string, fgHex: string = "#FFFFFF"): string {
  return bold(colorizeBg(` ${label} `, bgHex, fgHex));
}

/** 计算终端文本实际占用宽度（兼容 CJK 东亚全角字符与 Emoji 2 列宽） */
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

/** 按真实终端显示宽度补充空格对齐 */
export function padDisplayWidth(str: string, targetWidth: number): string {
  const currentWidth = getDisplayWidth(str);
  const padding = Math.max(0, targetWidth - currentWidth);
  return str + " ".repeat(padding);
}
