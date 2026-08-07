import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";

interface ShortcutRow {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-alpha bg-surface-elevated px-1.5 font-mono text-[11px] text-foreground">
      {children}
    </kbd>
  );
}

/**
 * P1: 快捷键帮助面板（⌘/）。
 * 与 CommandPalette / Settings 等现有浮层风格保持一致。
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  incognitoShortcut = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 桌面端 ⌘⇧I 可用；Web 端浏览器会占用该组合键，可关闭该项展示 */
  incognitoShortcut?: boolean;
}) {
  const groups: ShortcutGroup[] = [
    {
      title: "对话",
      rows: [
        { keys: ["⌘", "N"], label: "新建对话" },
        { keys: ["⌘", "1–9"], label: "切换到第 N 个 Work" },
        { keys: ["⌘", "K"], label: "打开命令面板" },
        { keys: ["Esc"], label: "关闭浮层 / 取消" },
      ],
    },
    {
      title: "视图",
      rows: [
        { keys: ["⌘", "B"], label: "折叠 / 展开侧边栏" },
        { keys: ["⌘", ","], label: "打开设置" },
        { keys: ["⌘", "/"], label: "查看快捷键" },
      ],
    },
    {
      title: "隐私",
      rows: incognitoShortcut
        ? [{ keys: ["⌘", "⇧", "I"], label: "无痕模式开关（不写入记忆）" }]
        : [{ keys: ["无快捷键"], label: "无痕模式开关（右上角眼睛图标）" }],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>键盘快捷键</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-5">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.rows.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between gap-4 text-[13px]"
                  >
                    <span className="text-foreground">{row.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {row.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          Ctrl 键同样适用（Windows / Linux）。
        </p>
      </DialogContent>
    </Dialog>
  );
}
