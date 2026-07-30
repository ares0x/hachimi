import { ChevronDown, ChevronRight, Flag, Pencil, Save, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { SectionLabel } from "./primitives";

export function GoalPanel({
  goal,
  workId,
  onChange,
  onSave,
  disabled = false,
  status,
  defaultCollapsed = false,
  className,
}: {
  goal?: string;
  /** @deprecated 保留向后兼容；实际 workId 可选 */
  workId?: string;
  /** Goal 变更回调（onChange 与 onSave 等价，任给一个即可） */
  onChange?: (newGoal: string) => void;
  onSave?: (newGoal: string) => void | Promise<void>;
  /** 禁用所有编辑操作 */
  disabled?: boolean;
  /** 当前 Work 状态，用于视觉提示 */
  status?: "active" | "waiting" | "blocked" | "completed" | "failed" | "archived";
  defaultCollapsed?: boolean;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal || "");
  const [saving, setSaving] = useState(false);

  const editable =
    !disabled && (onChange || onSave) && status !== "completed" && status !== "archived";

  const handleSave = async () => {
    if (!editable) return;
    setSaving(true);
    try {
      const trimmed = draft.trim();
      if (onSave) {
        await onSave(trimmed);
      }
      onChange?.(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(goal || "");
    setEditing(false);
  };

  const STATUS_TONE: Record<NonNullable<typeof status>, string> = {
    active: "text-info",
    waiting: "text-warning",
    blocked: "text-warning",
    completed: "text-success",
    failed: "text-danger",
    archived: "text-muted-foreground/60",
  };

  return (
    <section className={cn("border-b border-border/60 bg-background/40", className)}>
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 sm:px-6">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label={collapsed ? "展开 Goal" : "折叠 Goal"}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        <Flag className="size-3.5 shrink-0 text-primary" />
        <SectionLabel className="px-0">目标</SectionLabel>
        {status && (
          <span
            className={cn(
              "ml-0.5 inline-flex items-center rounded-full border border-border px-1.5 font-mono text-[10px] uppercase tracking-wider",
              STATUS_TONE[status]
            )}
          >
            {statusLabel(status)}
          </span>
        )}
        {!collapsed && !editing && editable && (
          <button
            type="button"
            onClick={() => {
              setDraft(goal || "");
              setEditing(true);
            }}
            className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Pencil className="size-3" />
            编辑
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-4 pb-3 sm:px-6">
          {editing ? (
            <div className="space-y-2 rounded-lg border border-border bg-surface-elevated p-2.5">
              <textarea
                rows={3}
                value={draft}
                disabled={saving}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="描述这个 Work 的目标…"
                className="w-full resize-none rounded-md bg-background p-2 text-[13.5px] leading-relaxed text-foreground outline-none ring-1 ring-border focus:ring-primary/40 disabled:opacity-60"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-60"
                >
                  <X className="size-3" />
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <Save className="size-3" />
                  保存
                </button>
              </div>
            </div>
          ) : goal ? (
            <p className="whitespace-pre-wrap rounded-md px-1 py-1 text-[13.5px] leading-relaxed text-foreground/90">
              {goal}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => editable && setEditing(true)}
              disabled={!editable}
              className="w-full rounded-md border border-dashed border-border/60 px-3 py-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              + 为这个 Work 设定目标（可选）
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function statusLabel(
  s: "active" | "waiting" | "blocked" | "completed" | "failed" | "archived"
): string {
  switch (s) {
    case "active":
      return "执行中";
    case "waiting":
      return "等待";
    case "blocked":
      return "阻塞";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "archived":
      return "已归档";
  }
}
