import {
  ArrowRight,
  Brain,
  ChevronDown,
  Compass,
  Moon,
  PanelLeft,
  PanelRight,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Mark } from "./primitives";

export interface FeatureItem {
  id: string;
  icon: typeof Compass;
  title: string;
  subtitle: string;
  prompt: string;
}

const QUICK_ACTIONS: FeatureItem[] = [
  {
    id: "explore",
    icon: Compass,
    title: "分析项目结构与架构",
    subtitle: "梳理目录树、模块关系与依赖风险",
    prompt: "分析当前项目的目录结构与架构设计",
  },
  {
    id: "plan",
    icon: Sparkles,
    title: "制定需求与 Work 执行步骤",
    subtitle: "描述业务意图，Agent 先生成 Plan 再执行",
    prompt: "针对当前项目提出下一阶段重构与新功能规划",
  },
  {
    id: "audit",
    icon: ShieldCheck,
    title: "检查安全与环境配置",
    subtitle: "审查敏感数据、工作区边界与沙箱规则",
    prompt: "检查工作区是否存在危险文件配置",
  },
  {
    id: "memory",
    icon: Brain,
    title: "总结工作要点与个人偏好",
    subtitle: "汇总今日执行轨迹并查看偏好记忆",
    prompt: "总结今日已完成的工作要点",
  },
];

export function WelcomeView({
  model = "deepseek-v4-flash",
  theme,
  onToggleTheme,
  contextOpen,
  onToggleContext,
  onToggleSidebar,
  onSelectPrompt,
  intentChips,
  onOpenSettings,
  onOpenPalette,
  sidebarCollapsed = false,
}: {
  model?: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  contextOpen: boolean;
  onToggleContext: () => void;
  onToggleSidebar: () => void;
  onSelectPrompt: (prompt: string) => void;
  /** 可选：覆盖默认 QUICK_ACTIONS 的 prompt 列表（用于外部注入） */
  intentChips?: string[];
  onOpenSettings?: () => void;
  onOpenPalette?: () => void;
  sidebarCollapsed?: boolean;
}) {
  const actions: FeatureItem[] =
    intentChips && intentChips.length > 0
      ? intentChips.map((p, i) => {
          const fallback = QUICK_ACTIONS[i % QUICK_ACTIONS.length];
          return {
            id: `chip_${i}`,
            icon: fallback.icon,
            title: p.length > 30 ? `${p.slice(0, 28)}…` : p,
            subtitle: p,
            prompt: p,
          };
        })
      : QUICK_ACTIONS;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Ghost Top Toolbar */}
      <header
        className={cn(
          "app-drag flex h-13 shrink-0 items-center justify-between border-b border-border/60 bg-background transition-[padding] duration-200",
          sidebarCollapsed ? "pl-[72px] pr-4" : "px-4"
        )}
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="app-no-drag grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="切换侧栏"
            title="切换侧边栏 (⌘B)"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>

        <div className="app-no-drag flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-[12px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <span className="size-2 rounded-full bg-emerald-500" />
            <span>{model}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="切换主题"
          >
            {theme === "light" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onToggleContext}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
              contextOpen
                ? "bg-surface-active text-foreground"
                : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
          >
            <PanelRight className="size-4" />
            <span className="hidden sm:inline">Inspector</span>
          </button>
        </div>
      </header>

      {/* Restrained Center Welcome Section */}
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-[42rem] flex-col items-center text-center">
          {/* Subtle Monogram */}
          <div className="flex size-11 items-center justify-center rounded-xl bg-surface-elevated shadow-sm">
            <Mark size={24} />
          </div>

          {/* 20px Title */}
          <h1 className="mt-4 text-[20px] font-medium tracking-tight text-foreground sm:text-[22px]">
            准备好开启哪项任务？
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            输入意图后，Hachimi 将自动分配 Work、先生成计划，并实时记录轨迹。
          </p>

          {/* Compact Quick Action Rows */}
          <div className="mt-6 flex w-full flex-col gap-2">
            {actions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectPrompt(item.prompt)}
                  className="group flex items-center justify-between rounded-lg border border-border/40 bg-surface-elevated/70 px-3.5 py-2.5 text-left transition-all duration-150 hover:border-border-strong hover:bg-surface-hover hover:shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded bg-surface text-muted-foreground group-hover:text-primary">
                      <Icon className="size-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="truncate text-[13px] font-medium text-foreground group-hover:text-primary">
                        {item.title}
                      </span>
                      <span className="ml-2 hidden text-[12px] text-muted-foreground sm:inline">
                        · {item.subtitle}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
