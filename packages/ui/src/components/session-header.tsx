import { PanelRight, PanelLeft, GitBranch } from "lucide-react";
import { Meta, StatusDot } from "./primitives";
import { ThemeToggle } from "./theme";
import { cn } from "../lib/utils";

export function SessionHeader({
  title,
  model,
  running,
  theme,
  onToggleTheme,
  contextOpen,
  onToggleContext,
  onToggleSidebar,
}: {
  title: string;
  model: string;
  running: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  contextOpen: boolean;
  onToggleContext: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground lg:hidden"
          aria-label="切换会话列表"
        >
          <PanelLeft className="size-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] leading-5 font-semibold text-foreground sm:text-[17px]">
            {title}
          </h1>
          <div className="mt-0.5 flex items-center gap-1.5">
            <StatusDot status={running ? "running" : "done"} />
            <Meta>{model} · single brain runtime</Meta>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="hidden h-8 items-center gap-1.5 rounded-md px-2 font-mono text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground sm:inline-flex"
        >
          <GitBranch className="size-3.5" />
          fork
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button
          type="button"
          onClick={onToggleContext}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[13px] transition-colors",
            contextOpen
              ? "border-border-strong bg-surface-active text-foreground"
              : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          )}
        >
          <PanelRight className="size-4" />
          <span className="hidden sm:inline">Inspector</span>
        </button>
      </div>
    </header>
  );
}
