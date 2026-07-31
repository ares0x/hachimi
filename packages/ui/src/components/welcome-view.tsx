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
import { Mark, StatusDot } from "./primitives";

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
  /** 可选：覆盖默认 QUICK_ACTIONS 的 prompt 列表 */
  intentChips?: string[];
  onOpenSettings?: () => void;
  onOpenPalette?: () => void;
  sidebarCollapsed?: boolean;
}) {
  const actions: FeatureItem[] =
    intentChips && intentChips.length > 0
      ? intentChips.map((p, i) => {
          const match = QUICK_ACTIONS.find((qa) => qa.prompt === p);
          if (match) return match;
          const fallback = QUICK_ACTIONS[i % QUICK_ACTIONS.length];
          return {
            id: `chip_${i}`,
            icon: fallback.icon,
            title: p,
            subtitle: "选择以开启此项 Work",
            prompt: p,
          };
        })
      : QUICK_ACTIONS;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Translucent Glass Header */}
      <header
        className={cn(
          "app-drag flex h-13 shrink-0 items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-xl transition-[padding] duration-200",
          sidebarCollapsed ? "pl-[72px] pr-4" : "px-4"
        )}
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="app-no-drag relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground before:absolute before:-inset-1.5 before:content-['']"
            aria-label="切换侧栏"
            title="切换侧边栏 (⌘B)"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>

        <div className="app-no-drag flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground before:absolute before:-inset-1.5 before:content-['']"
            aria-label="切换主题"
          >
            {theme === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onToggleContext}
            className={cn(
              "relative inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors before:absolute before:-inset-1.5 before:content-['']",
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

      {/* Restrained Center Welcome Section */}
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-[40rem] flex-col items-center text-center">
          {/* Monogram */}
          <div className="flex size-11 items-center justify-center rounded-2xl bg-surface-elevated shadow-sm ring-1 ring-border/50">
            <Mark size={24} />
          </div>

          {/* Title & Description with proper tracking & Chinese font weight */}
          <h1 className="mt-4 text-[22px] font-medium tracking-tight text-foreground sm:text-[24px]">
            准备好开启哪项任务？
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            输入意图后，Hachimi 将自动分配 Work、先生成计划，并实时记录轨迹。
          </p>

          {/* Borderless Card Suggestions */}
          <div className="mt-6 flex w-full flex-col gap-2.5">
            {actions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectPrompt(item.prompt)}
                  className="group flex items-center justify-between rounded-xl border border-border/30 bg-surface-elevated/80 px-4 py-3 text-left shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-border/80 hover:bg-surface-elevated hover:shadow-md"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-foreground group-hover:text-primary">
                          {item.title}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
