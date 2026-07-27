import { ChevronDown, GitBranch, Moon, PanelLeft, PanelRight, Sun } from "lucide-react";
import { cn } from "../lib/utils";
import { Meta, StatusDot } from "./primitives";

export function SessionHeader({
  title,
  model = "deepseek-v4-flash",
  running,
  theme,
  onToggleTheme,
  contextOpen,
  onToggleContext,
  onToggleSidebar,
}: {
  title: string;
  model?: string;
  running: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  contextOpen: boolean;
  onToggleContext: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="app-drag flex h-13 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="app-no-drag grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground lg:hidden"
          aria-label="切换侧栏"
        >
          <PanelLeft className="size-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-medium text-foreground">{title}</h1>
        </div>
      </div>

      <div className="app-no-drag flex shrink-0 items-center gap-1">
        {/* Ghost Model Selector */}
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-[12px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <StatusDot status={running ? "running" : "done"} />
          <span>{model}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>

        {/* Ghost Fork Button */}
        <button
          type="button"
          className="hidden h-8 items-center gap-1.5 rounded-md px-2 font-mono text-[12px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground sm:inline-flex"
        >
          <GitBranch className="size-3.5" />
          fork
        </button>

        {/* Icon-Only Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="切换主题"
          title={theme === "light" ? "切换至深色模式" : "切换至浅色模式"}
        >
          {theme === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>

        {/* Ghost Inspector Toggle */}
        <button
          type="button"
          onClick={onToggleContext}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
            contextOpen
              ? "bg-surface-active text-foreground"
              : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          )}
        >
          <PanelRight className="size-4" />
          <span className="hidden sm:inline">Inspector</span>
        </button>
      </div>
    </header>
  );
}
