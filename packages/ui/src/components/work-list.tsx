import {
  Check,
  Command,
  FolderOpen,
  PanelLeft,
  Pencil,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import type { WorkItem } from "../api";
import { cn, formatRelativeTime } from "../lib/utils";
import { Mark, SectionLabel } from "./primitives";

export type WorkStatus =
  | "active"
  | "waiting"
  | "blocked"
  | "completed"
  | "cancelled"
  | "failed"
  | "archived";

const STATUS_COLOR: Record<WorkStatus, string> = {
  active: "bg-blue-500",
  waiting: "bg-amber-500",
  blocked: "bg-red-500",
  completed: "bg-emerald-500",
  cancelled: "bg-zinc-500",
  failed: "bg-rose-500",
  archived: "bg-zinc-400",
};

const STATUS_LABEL: Record<WorkStatus, string> = {
  active: "进行中",
  waiting: "等待处理",
  blocked: "阻塞中",
  completed: "已完成",
  cancelled: "已取消",
  failed: "已失败",
  archived: "已归档",
};

export function WorkList({
  works,
  activeWorkId,
  collapsed = false,
  onToggleCollapse,
  onSelectWork,
  onRenameWork,
  onDeleteWork,
  onNewWork,
  onOpenProject,
  onOpenPalette,
  onOpenSettings,
}: {
  works: WorkItem[];
  activeWorkId: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onSelectWork: (id: string) => void;
  onRenameWork?: (id: string, title: string) => void;
  onDeleteWork?: (id: string) => void;
  onNewWork: () => void;
  onOpenProject?: () => void;
  onOpenPalette: () => void;
  onOpenSettings?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartEdit = (e: React.MouseEvent, w: WorkItem) => {
    e.stopPropagation();
    setEditingId(w.id);
    setEditTitle(w.title);
  };

  const handleSaveEdit = (e: React.MouseEvent | React.FormEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (editTitle.trim() && onRenameWork) {
      onRenameWork(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (onDeleteWork) {
      onDeleteWork(id);
    }
  };

  if (collapsed) {
    return null;
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-surface">
      {/* macOS Draggable Header & Traffic Light Clearance */}
      <div className="app-drag flex h-13 shrink-0 items-center justify-between border-b border-border/60 bg-surface px-3.5 pl-[72px]">
        <div className="flex items-center gap-2">
          <Mark size={20} />
          <span className="wordmark text-[14px] font-semibold text-foreground">Hachimi</span>
        </div>
        <div className="app-no-drag flex items-center gap-0.5">
          <button
            type="button"
            onClick={onNewWork}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            title="新建对话"
            aria-label="新建对话"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {/* Work List */}
      <div className="mt-1 flex min-h-0 flex-1 flex-col px-2.5">
        <div className="flex items-center justify-between px-2 py-1">
          <SectionLabel>最近对话与项目</SectionLabel>
        </div>
        <ul className="scroll-quiet mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
          {works.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-2 py-6 text-center">
              <span className="text-xs text-muted-foreground">暂无历史记录</span>
              <button
                type="button"
                onClick={onNewWork}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface-elevated px-3 py-1.5 font-mono text-xs font-medium text-foreground shadow-xs transition-all hover:bg-surface-hover hover:border-border"
              >
                <Plus className="size-3.5 text-primary" />
                <span>新建对话 (⌘N)</span>
              </button>
            </div>
          ) : (
            works.map((w) => {
              const active = w.id === activeWorkId;
              const isEditing = editingId === w.id;
              const statusDotClass = STATUS_COLOR[w.status] || "bg-zinc-400";

              return (
                <li key={w.id}>
                  {isEditing ? (
                    <form
                      onSubmit={(e) => handleSaveEdit(e, w.id)}
                      className="flex items-center gap-1 rounded-md border border-primary bg-surface p-1.5"
                    >
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full min-w-0 bg-transparent px-1 text-[13px] text-foreground focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={(e) => handleSaveEdit(e, w.id)}
                        className="grid size-6 shrink-0 place-items-center rounded text-primary hover:bg-surface-hover"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-surface-hover"
                      >
                        <X className="size-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div
                      onClick={() => onSelectWork(w.id)}
                      className={cn(
                        "group relative flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-2 transition-colors",
                        active ? "nav-rail bg-surface-active" : "hover:bg-surface-hover"
                      )}
                    >
                      <div className="min-w-0 flex-1 pr-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn("size-2 rounded-full shrink-0", statusDotClass)}
                            title={STATUS_LABEL[w.status]}
                          />
                          <span
                            className={cn(
                              "truncate text-[13px]",
                              active
                                ? "font-medium text-foreground"
                                : "text-muted-foreground group-hover:text-foreground"
                            )}
                          >
                            {w.title}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground pl-4">
                          <span>{STATUS_LABEL[w.status]}</span>
                          {w.planTotal > 0 && (
                            <>
                              <span>·</span>
                              <span>
                                Plan {w.planDone}/{w.planTotal}
                              </span>
                            </>
                          )}
                          <span>·</span>
                          <span>{formatRelativeTime(new Date(w.updatedAt).getTime())}</span>
                        </div>
                      </div>

                      {/* Actions on hover */}
                      <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
                        <button
                          type="button"
                          onClick={(e) => handleStartEdit(e, w)}
                          className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                          title="重命名工作"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, w.id)}
                          className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-surface-hover hover:text-destructive"
                          title="删除工作"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* Footer Navigation */}
      <div className="border-t border-border p-3 space-y-0.5">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Command className="size-4" />
          <span className="flex-1 text-left">命令面板</span>
          <span className="font-mono text-[11px]">⌘K</span>
        </button>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Settings className="size-4" />
            <span className="flex-1 text-left">设置</span>
            <span className="font-mono text-[11px]">⌘,</span>
          </button>
        )}
      </div>
    </aside>
  );
}
