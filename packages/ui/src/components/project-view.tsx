import { ArrowLeft, FolderOpen, GitBranch, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { ProjectItem, WorkItem } from "../api";
import { cn, formatRelativeTime } from "../lib/utils";
import { Mark, SectionLabel } from "./primitives";

const WORK_STATUS_LABEL: Record<string, string> = {
  active: "进行中",
  waiting: "等待处理",
  blocked: "阻塞中",
  completed: "已完成",
  cancelled: "已取消",
  failed: "已失败",
  archived: "已归档",
};

const WORK_STATUS_COLOR: Record<string, string> = {
  active: "bg-blue-500",
  waiting: "bg-amber-500",
  blocked: "bg-red-500",
  completed: "bg-emerald-500",
  cancelled: "bg-zinc-500",
  failed: "bg-rose-500",
  archived: "bg-zinc-400",
};

/**
 * 项目视图：展示项目元数据 + 其下 Works（1:N 集合）。
 * 新任务通过 onCreateTask 绑定到当前项目（projectId + workspaceRoot）。
 */
export function ProjectView({
  project,
  works,
  onOpenWork,
  onCreateTask,
  onClose,
  onRename,
  onDelete,
}: {
  project: ProjectItem;
  works: WorkItem[];
  onOpenWork: (id: string) => void;
  onCreateTask: () => void;
  onClose: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(project.name);

  const saveRename = () => {
    const next = draftName.trim();
    if (next && next !== project.name && onRename) {
      onRename(next);
    }
    setEditing(false);
  };

  return (
    <div className="scroll-quiet h-full w-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[52rem] px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-elevated ring-1 ring-border/50"
                style={
                  project.color ? { boxShadow: `inset 0 0 0 1px ${project.color}55` } : undefined
                }
              >
                <FolderOpen
                  className="size-5"
                  style={project.color ? { color: project.color } : undefined}
                />
              </div>
              <div className="min-w-0 flex-1">
                {editing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveRename();
                    }}
                    className="flex items-center gap-1"
                  >
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      autoFocus
                      className="w-full min-w-0 rounded-md border border-primary bg-surface px-2 py-1 text-[18px] font-medium text-foreground focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="grid size-7 shrink-0 place-items-center rounded-md text-primary hover:bg-surface-hover"
                      aria-label="保存"
                    >
                      <Mark size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-hover"
                      aria-label="取消"
                    >
                      <X className="size-3.5" />
                    </button>
                  </form>
                ) : (
                  <div className="group flex items-center gap-2">
                    <h1 className="truncate text-[20px] font-medium tracking-tight text-foreground">
                      {project.name}
                    </h1>
                    {onRename && (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftName(project.name);
                          setEditing(true);
                        }}
                        className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground group-hover:opacity-100"
                        aria-label="重命名项目"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}
                <p className="mt-1 truncate font-mono text-[12px] text-muted-foreground">
                  {project.workspaceRoot}
                </p>
              </div>
            </div>

            {/* Meta badges */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {project.git?.branch && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-surface-elevated px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  <GitBranch className="size-3" />
                  {project.git.branch}
                </span>
              )}
              <span className="inline-flex items-center rounded-md border border-border/80 bg-surface-elevated px-2 py-1 font-mono text-[11px] text-muted-foreground">
                {works.length} 个任务
              </span>
              <span className="inline-flex items-center rounded-md border border-border/80 bg-surface-elevated px-2 py-1 font-mono text-[11px] text-muted-foreground">
                更新于 {formatRelativeTime(new Date(project.updatedAt).getTime())}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      `删除项目「${project.name}」？（其下 ${works.length} 个任务会被解绑，数据保留）`
                    )
                  ) {
                    onDelete();
                  }
                }}
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-destructive"
                aria-label="删除项目"
                title="删除项目"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-surface-elevated px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              返回
            </button>
          </div>
        </div>

        {/* Works */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <SectionLabel>项目任务</SectionLabel>
            <button
              type="button"
              onClick={onCreateTask}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 bg-surface-elevated px-3 text-[13px] font-medium text-foreground shadow-xs transition-all hover:bg-surface-hover hover:border-border active:scale-[0.975]"
            >
              <Plus className="size-3.5 text-primary" />
              新建任务
            </button>
          </div>

          <ul className="mt-3 space-y-1">
            {works.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center">
                <FolderOpen className="mx-auto size-6 text-muted-foreground/50" />
                <p className="mt-2 text-[13px] text-muted-foreground">
                  该项目还没有任务，创建第一个任务开始工作
                </p>
                <button
                  type="button"
                  onClick={onCreateTask}
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-transform active:scale-[0.97] hover:opacity-90"
                >
                  <Plus className="size-3.5" />
                  新建任务
                </button>
              </div>
            ) : (
              works.map((w) => {
                const dotColor = WORK_STATUS_COLOR[w.status] || "bg-zinc-400";
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => onOpenWork(w.id)}
                      className="group flex w-full items-center justify-between rounded-lg border border-border/30 bg-surface-elevated/60 px-3.5 py-2.5 text-left transition-all hover:border-border/80 hover:bg-surface-elevated"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("size-2 shrink-0 rounded-full", dotColor)} />
                          <span className="truncate text-[13.5px] font-medium text-foreground">
                            {w.title}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 pl-4 font-mono text-[11px] text-muted-foreground">
                          <span>{WORK_STATUS_LABEL[w.status] || w.status}</span>
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
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
