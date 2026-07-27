import {
  Brain,
  Code2,
  MessageSquare,
  Moon,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Mode } from "../lib/agent-demo";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./command";

export function CommandPalette({
  open,
  onOpenChange,
  onSelectMode,
  onNewSession,
  onToggleTheme,
  onRunDemo,
  onExportBundle,
  theme,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectMode?: (m: Mode) => void;
  onNewSession: () => void;
  onToggleTheme: () => void;
  onRunDemo?: () => void;
  onExportBundle?: () => void;
  theme?: string;
}) {
  const run = (fn?: () => void) => () => {
    onOpenChange(false);
    if (fn) fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="输入意图或命令…" />
      <CommandList>
        <CommandEmpty>没有匹配的命令</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(onNewSession)}>
            <Plus className="mr-2 size-4" />
            New session
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(onRunDemo)}>
            <ShieldCheck className="mr-2 size-4" />
            运行演示任务（含授权请求）
            <CommandShortcut>⌘⏎</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(onToggleTheme)}>
            <Moon className="mr-2 size-4" />
            切换主题
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Modes">
          <CommandItem onSelect={run(() => onSelectMode?.("chat"))}>
            <MessageSquare className="mr-2 size-4" />
            对话模式
            <CommandShortcut>⌘1</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => onSelectMode?.("code"))}>
            <Code2 className="mr-2 size-4" />
            代码模式
            <CommandShortcut>⌘2</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => onSelectMode?.("research"))}>
            <Search className="mr-2 size-4" />
            研究模式
            <CommandShortcut>⌘3</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => onSelectMode?.("write"))}>
            <PenLine className="mr-2 size-4" />
            写作模式
            <CommandShortcut>⌘4</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Memory">
          <CommandItem>
            <Brain className="mr-2 size-4" />
            打开记忆浏览器
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
