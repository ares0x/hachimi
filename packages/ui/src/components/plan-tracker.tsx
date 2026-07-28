import { Check, ChevronDown, ChevronRight, Loader2, Play, Plus, SkipForward, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "../lib/utils";
import { SectionLabel } from "./primitives";

export type PlanStepStatus = "pending" | "running" | "done" | "skipped";

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: PlanStepStatus;
  completedAt?: string;
}

const STEP_ICON: Record<PlanStepStatus, typeof Check> = {
  pending: ChevronRight,
  running: Loader2,
  done: Check,
  skipped: SkipForward,
};

const STEP_ICON_TINT: Record<PlanStepStatus, string> = {
  pending: "text-muted-foreground/70",
  running: "text-info animate-spin",
  done: "text-success",
  skipped: "text-muted-foreground/50",
};

const STEP_ROW_TINT: Record<PlanStepStatus, string> = {
  pending: "border-border/60 bg-surface-elevated/40",
  running: "border-info/40 bg-info/5",
  done: "border-success/40 bg-success/5",
  skipped: "border-border/50 bg-surface/50 opacity-60",
};

export function PlanTracker({
  steps,
  defaultCollapsed = false,
  onStepClick,
  onChange,
  editable = true,
  className,
}: {
  steps: PlanStep[];
  defaultCollapsed?: boolean;
  onStepClick?: (step: PlanStep) => void;
  /** 变更回调（只有提供此 prop 才允许真正落盘） */
  onChange?: (next: PlanStep[]) => void | Promise<void>;
  /** 是否显示编辑控件（onChange 提供时默认可编辑；否则强制只读） */
  editable?: boolean;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const canEdit = Boolean(editable && onChange);
  const [localDraft, setLocalDraft] = useState<Record<string, { title?: string; description?: string; status?: PlanStepStatus }> | null>(null);
  const [saving, setSaving] = useState(false);

  const commit = useCallback(
    async (next: PlanStep[]) => {
      if (!onChange) return;
      setSaving(true);
      try {
        const out = onChange(next);
        if (out && typeof (out as any).then) await out;
        setLocalDraft(null);
      } finally {
        setSaving(false);
      }
    },
    [onChange]
  );

  if (!steps || steps.length === 0) {
    // 空状态 + 可编辑时提供一个引导按钮
    if (!canEdit) return null;
    return (
      <section className={cn("border-b border-border/60 bg-background/50", className)}>
        <div className="px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <SectionLabel className="px-0">执行计划</SectionLabel>
            <span className="font-mono text-[11px] text-muted-foreground">0 / 0</span>
          </div>
          <button
            type="button"
            onClick={async () => {
            const id = `s_${Date.now()}`;
            const next: PlanStep[] = [
              { id, title: "步骤 1：描述第一个步骤", status: "pending" },
            ];
            await commit(next);
          }}
            disabled={saving}
            className="mt-2 w-full rounded-md border border-dashed border-border/60 px-3 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
          >
            <Plus className="-mt-0.5 mr-1 inline size-3" />
            为这个 Work 添加第一个执行步骤
          </button>
        </div>
      </section>
    );
  }

  const doneCount = steps.filter((s) => s.status === "done").length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <section className={cn("border-b border-border/60 bg-background/50", className)}>
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="grid size-6 place-items-center shrink-0 rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label={collapsed ? "展开计划" : "折叠计划"}
        >
          {collapsed ? (
            <ChevronRight className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SectionLabel className="px-0">执行计划</SectionLabel>
            <span className="font-mono text-[11px] text-muted-foreground">
              {doneCount} / {steps.length} · {pct}%
            </span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {canEdit && !collapsed && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              const id = `s_${Date.now()}`;
              await commit([
                ...steps,
                {
                  id,
                  title: `步骤 ${steps.length + 1}：新步骤`,
                  status: "pending",
                },
              ]);
            }}
            disabled={saving}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-60"
            title="新增步骤"
          >
            <Plus className="size-3" />
            <span>新增</span>
          </button>
        )}
      </div>

      {!collapsed && (
        <ol className="space-y-1.5 px-4 pb-2 sm:px-6">
          {steps.map((step, i) => {
            const Icon = STEP_ICON[step.status];
            const isLast = i === steps.length - 1;
            const draft = localDraft?.[step.id] ?? null;
            const title = draft?.title ?? step.title;
            const status: PlanStepStatus = draft?.status ?? step.status;
            return (
              <li
                key={step.id}
                className="relative"
                onClick={() => onStepClick?.(step)}
              >
                {!isLast && status !== "done" && (
                  <span
                    className={cn(
                      "absolute left-[11px] top-6 h-[calc(100%-0.25rem)] w-px",
                      status === "running" ? "bg-info/40" : "bg-border/60"
                    )}
                    aria-hidden
                  />
                )}
                <div
                  className={cn(
                    "group relative ml-0 flex gap-2 rounded-lg border p-2.5 pl-2 transition-colors",
                    STEP_ROW_TINT[status],
                    (onStepClick || canEdit) && "cursor-pointer hover:border-border-strong"
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canEdit) return;
                      const order: PlanStepStatus[] = ["pending", "running", "done", "skipped"];
                      const idx = order.indexOf(status);
                      const next = order[(idx + 1) % order.length];
                      setLocalDraft((prev) => ({ ...(prev ?? {}), [step.id]: { ...(prev?.[step.id] ?? {}), status: next } }));
                      // 即时落盘（为了让切换状态能反映到 timeline 进度）
                      commit(steps.map((s) => (s.id === step.id ? { ...s, status: next } : s)));
                    }}
                    className="grid size-5 shrink-0 place-items-center transition-opacity"
                    title={canEdit ? "点击切换步骤状态" : undefined}
                  >
                    <Icon className={cn("size-3.5", STEP_ICON_TINT[status])} />
                  </button>
                  <div className="min-w-0 flex-1">
                    {canEdit && localDraft && localDraft[step.id] && "title" in (localDraft[step.id] ?? {}) ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={title}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            setLocalDraft((prev) => ({
                              ...(prev ?? {}),
                              [step.id]: { ...(prev?.[step.id] ?? {}), title: e.target.value },
                            }))
                          }
                          onBlur={() =>
                            commit(
                              steps.map((s) =>
                                s.id === step.id ? { ...s, title, status } : s
                              )
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="w-full rounded-md border border-border/70 bg-background px-2 py-1 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    ) : (
                      <div
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (canEdit) {
                            setLocalDraft((prev) => ({
                              ...(prev ?? {}),
                              [step.id]: {
                                ...(prev?.[step.id] ?? {}),
                                title,
                              },
                            }));
                          }
                        }}
                        className={cn(
                          "text-[13.5px] leading-snug select-none",
                          status === "done"
                            ? "text-muted-foreground line-through decoration-muted-foreground/40"
                            : status === "running"
                              ? "font-medium text-foreground"
                              : "text-foreground"
                        )}
                      >
                        {step.title}
                        {status === "running" && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-info/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-info">
                            <Play className="size-2.5" />
                            进行中
                          </span>
                        )}
                      </div>
                    )}
                    {step.description && (
                      <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground/80">
                        {step.description}
                      </p>
                    )}
                    {step.completedAt && status === "done" && (
                      <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground/60">
                        完成于 {new Date(step.completedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        commit(steps.filter((s) => s.id !== step.id));
                      }}
                      className="opacity-0 transition-opacity group-hover:opacity-100 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      title="删除步骤"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {canEdit && (
            <li className="pt-0.5">
              <button
                type="button"
                onClick={async () => {
                  const id = `s_${Date.now()}`;
                  await commit([
                    ...steps,
                    {
                      id,
                      title: `步骤 ${steps.length + 1}：新步骤`,
                      status: "pending",
                    },
                  ]);
                }}
                disabled={saving}
                className="mt-0.5 w-full rounded-md border border-dashed border-border/60 px-3 py-1.5 text-left text-[11.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
              >
                <Plus className="-mt-0.5 mr-1 inline size-3" />
                新增执行步骤
              </button>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
