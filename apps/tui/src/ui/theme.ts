// apps/tui/src/ui/theme.ts
/**
 * Grok-build 与 Pi 风格的高级终端主题与 ANSI 渲染引擎
 */

export interface UITheme {
  name: string;
  label: string;
  colors: {
    primary: string;       // 主色调（如亮青/蓝）
    secondary: string;     // 次要 Accent 调
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

/** Grok Slate Dark（默认：深灰石板底 + 冰蓝高亮） */
export const grokSlateTheme: UITheme = {
  name: "grok-slate",
  label: "Grok Slate (深沉蓝石板)",
  colors: {
    primary: "#38BDF8",      // 冰晶蓝 Sky Blue
    secondary: "#818CF8",    // 靛青 Indigo
    background: "#0F172A",
    panelBg: "#1E293B",
    border: "#475569",       // 柔和石板灰边框
    text: "#F8FAFC",         // 高纯白文本
    subtext: "#94A3B8",      // 次要灰
    userRole: "#38BDF8",     // 用户蓝
    assistantRole: "#34D399", // 柔和薄荷绿
    systemRole: "#FBBF24",   // 暖金黄
    toolRole: "#A7F3D0",     // 浅青绿
    success: "#34D399",
    warning: "#F59E0B",
    error: "#F87171",
  },
};

/** Grok Warm Amber (琥珀金黑) */
export const grokAmberTheme: UITheme = {
  name: "grok-amber",
  label: "Grok Amber (暖金琥珀黑)",
  colors: {
    primary: "#F59E0B",      // 亮琥珀
    secondary: "#EA580C",    // 暖红橙
    background: "#0A0A0A",
    panelBg: "#1C1917",
    border: "#78350F",       // 古铜边框
    text: "#FAFAF9",
    subtext: "#A8A29E",
    userRole: "#F59E0B",
    assistantRole: "#10B981",
    systemRole: "#F59E0B",
    toolRole: "#F97316",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
  },
};

/** Grok Midnight Neon (午夜霓虹紫) */
export const grokNeonTheme: UITheme = {
  name: "grok-neon",
  label: "Grok Neon (午夜霓虹紫)",
  colors: {
    primary: "#A855F7",      // 电光紫
    secondary: "#06B6D4",    // 霓虹青
    background: "#090D16",
    panelBg: "#131B2E",
    border: "#6B21A8",
    text: "#F8FAFC",
    subtext: "#64748B",
    userRole: "#38BDF8",
    assistantRole: "#C084FC",
    systemRole: "#FDE047",
    toolRole: "#22D3EE",
    success: "#4ADE80",
    warning: "#FACC15",
    error: "#FB7185",
  },
};

/** Grok Jade Matrix (黑客矩阵绿) */
export const grokJadeTheme: UITheme = {
  name: "grok-jade",
  label: "Grok Matrix (矩阵翡翠绿)",
  colors: {
    primary: "#10B981",      // 翡翠绿
    secondary: "#06B6D4",
    background: "#061412",
    panelBg: "#0F2925",
    border: "#047857",
    text: "#ECFDF5",
    subtext: "#6EE7B7",
    userRole: "#38BDF8",
    assistantRole: "#34D399",
    systemRole: "#FCD34D",
    toolRole: "#A7F3D0",
    success: "#34D399",
    warning: "#F59E0B",
    error: "#F87171",
  },
};

export const THEMES: Record<string, UITheme> = {
  "grok-slate": grokSlateTheme,
  "grok-amber": grokAmberTheme,
  "grok-neon": grokNeonTheme,
  "grok-jade": grokJadeTheme,
};

let currentTheme = grokSlateTheme;

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

export const defaultTheme = grokSlateTheme;

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

/** Grok-build 风格的 Pill Badge 徽章 */
export function renderBadge(label: string, bgHex: string, fgHex: string = "#000000"): string {
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
