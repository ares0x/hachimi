import { ChevronDown, GitBranch, Moon, OctagonX, PanelLeft, PanelRight, Sun } from "lucide-react";
import { cn } from "../lib/utils";
import { Meta, StatusDot } from "./primitives";

export function SessionHeader({
  title,
  subtitle,
  model = "deepseek-v4-flash",
  running,
  theme,
  onToggleTheme,
  contextOpen,
  onToggleContext,
  onToggleSidebar,
  onCancelWork,
  sidebarCollapsed = false,
  onOpenSettings,
  onOpenPalette,
}: {
  title: string;
  /** 标题下方一行小字说明，例如状态或 subtitle */
  subtitle?: string;
  model?: string;
  running: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  contextOpen: boolean;
  onToggleContext: () => void;
  onToggleSidebar: () => void;
  onCancelWork?: () => void;
  sidebarCollapsed?: boolean;
  onOpenSettings?: () => void;
  onOpenPalette?: () => void;
}) {
  return (
    <header
      className={cn(
        "app-drag flex h-13 shrink-0 items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-xl transition-[padding] duration-200",
        sidebarCollapsed ? "pl-[72px] pr-4" : "px-4"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="app-no-drag grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="切换侧栏"
          title="切换侧边栏 (⌘B)"
        >
          <PanelLeft className="size-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-medium text-foreground">{title}</h1>
          {subtitle && <Meta className="mt-0.5">{subtitle}</Meta>}
        </div>
      </div>

      <div className="app-no-drag flex shrink-0 items-center gap-1">
        {onCancelWork && (
          <button
            type="button"
            onClick={onCancelWork}
            className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-danger transition-colors hover:bg-danger/10 sm:inline-flex"
            title="取消当前 Work 的执行"
          >
            <OctagonX className="size-3.5" />
            <span>取消</span>
          </button>
        )}

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
