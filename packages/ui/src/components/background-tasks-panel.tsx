// packages/ui/src/components/background-tasks-panel.tsx
/**
 * L1 (D3): 后台任务面板 — 轮询 GET /api/tasks，展示状态/输出，可终止。
 * 数据源是 daemon 的 BackgroundTaskManager（append-only 投影），UI 只读 + 触发 kill。
 */
import { ChevronDown, ChevronUp, CircleX, SquareTerminal, TerminalSquare, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { type BackgroundTaskItem, fetchTasks, killTask } from "../api";
import { cn } from "../lib/utils";

const TASK_STATUS_LABEL: Record<BackgroundTaskItem["status"], string> = {
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  killed: "已终止",
};

function taskStatusTone(status: BackgroundTaskItem["status"]): string {
  switch (status) {
    case "running":
      return "text-info border-info/35 bg-info/10";
    case "completed":
      return "text-success border-success/35 bg-success/10";
    case "failed":
      return "text-danger border-danger/35 bg-danger/10";
    case "killed":
      return "text-muted-foreground border-border bg-background/40";
  }
}

function formatTime(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function TaskCard({
  task,
  onKill,
}: {
  task: BackgroundTaskItem;
  onKill: (taskId: string) => void;
}) {
  const [outputOpen, setOutputOpen] = useState(false);
  const isRunning = task.status === "running";
  const output = task.output?.trim();
  const outputPreview = output ? output.split("\n").slice(-6).join("\n") : "";

  return (
    <div className="rounded-lg border border-border/70 bg-background/60">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <TerminalSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[13px] font-medium text-foreground">
              {task.label?.trim() || task.taskId}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 font-mono text-[11px] leading-4",
                taskStatusTone(task.status)
              )}
            >
              {TASK_STATUS_LABEL[task.status]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
            <span title={task.taskId}>id: {task.taskId.slice(0, 12)}</span>
            {task.pid !== undefined && <span>pid: {task.pid}</span>}
            <span>开始 {formatTime(task.startedAt)}</span>
            {task.completedAt !== undefined && <span>结束 {formatTime(task.completedAt)}</span>}
            {task.exitCode !== undefined && task.exitCode !== null && (
              <span>exit {task.exitCode}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isRunning && (
            <button
              type="button"
              onClick={() => onKill(task.taskId)}
              className="inline-flex h-6.5 items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 text-[11.5px] text-danger transition-colors hover:bg-danger/20 active:scale-[0.97]"
            >
              <CircleX className="size-3.5" />
              终止
            </button>
          )}
          {outputPreview && (
            <button
              type="button"
              onClick={() => setOutputOpen((v) => !v)}
              className="inline-flex h-6.5 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              {outputOpen ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
              输出
            </button>
          )}
        </div>
      </div>
      {outputOpen && (
        <pre className="max-h-48 overflow-auto border-t border-border/60 bg-surface-elevated/50 px-3 py-2.5 font-mono text-[11.5px] leading-[1.5] text-foreground/90 whitespace-pre-wrap break-words">
          {outputPreview}
        </pre>
      )}
    </div>
  );
}

/**
 * Right-side drawer. 轮询间隔 2s（运行中）；打开时立即拉取一次。
 */
export function BackgroundTasksPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tasks, setTasks] = useState<BackgroundTaskItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      const list = await fetchTasks();
      if (cancelled) return;
      setTasks(list);
      setError(null);
    };
    void load();
    const timer = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open]);

  const runningCount = tasks.filter((t) => t.status === "running").length;

  const handleKill = async (taskId: string) => {
    const ok = await killTask(taskId);
    if (!ok) setError(`终止任务失败：${taskId}`);
    const list = await fetchTasks();
    setTasks(list);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      setTasks(await fetchTasks());
      setError(null);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭后台任务面板"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/20"
      />
      <motion.aside
        initial={{ x: 360, opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 360, opacity: 0 }}
        transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.32 }}
        className="absolute inset-y-0 right-0 flex w-[340px] flex-col border-l border-border bg-background"
      >
        <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <SquareTerminal className="size-4 text-primary" />
          <h2 className="text-[14px] font-semibold text-foreground">后台任务</h2>
          {runningCount > 0 && (
            <span className="inline-flex items-center rounded-sm border border-info/35 bg-info/10 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-info">
              {runningCount} 运行中
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex h-6.5 items-center rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
            >
              刷新
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="inline-flex size-6.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {error}
            </div>
          )}
          {tasks.length === 0 && !error && (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <TerminalSquare className="size-7 text-border-strong" />
              <p className="text-[13px] text-muted-foreground">暂无后台任务</p>
              <p className="max-w-[220px] text-[11.5px] leading-relaxed text-muted-foreground/70">
                后台命令任务（P0-3）会显示在这里，运行中的任务可随时终止。
              </p>
            </div>
          )}
          {tasks.map((task) => (
            <TaskCard key={task.taskId} task={task} onKill={handleKill} />
          ))}
        </div>
      </motion.aside>
    </div>
  );
}
