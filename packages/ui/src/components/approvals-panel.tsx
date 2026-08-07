// packages/ui/src/components/approvals-panel.tsx
/**
 * L1 (D17): 待审批面板 — 轮询 GET /api/approvals，跨 Work 集中审批。
 * 与 PermissionDock 互补：Dock 是流式会话内的即时审批，本面板是托盘
 * openApprovals / 角标点击后的集中入口。
 */
import { Check, Clock3, ShieldQuestion, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { approveTool, fetchPendingApprovals, type PendingApprovalItem } from "../api";
import { DiffViewer } from "./diff-viewer";

const TOOL_LABEL: Record<string, string> = {
  write_file: "写入文件",
  replace_file_content: "替换文件内容",
  delete_file: "删除文件",
  run_command: "执行命令",
  update_work_plan: "更新工作计划",
  enter_plan_mode: "进入计划模式",
  exit_plan_mode: "退出计划模式",
  start_background_command: "启动后台命令",
  ask_user_question: "提问",
  browser_click: "浏览器 · 点击",
  browser_type: "浏览器 · 输入",
};

function prettyToolName(toolName: string): string {
  return TOOL_LABEL[toolName] || toolName;
}

function formatRequestedAt(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s 前`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m 前`;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ApprovalCard({
  item,
  onDecide,
}: {
  item: PendingApprovalItem;
  onDecide: (approvalId: string, decision: "approve" | "deny") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const decide = async (decision: "approve" | "deny") => {
    setBusy(true);
    try {
      await onDecide(item.approvalId, decision);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-warning/25 bg-warning/[0.04]">
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldQuestion className="size-4 shrink-0 text-warning" />
          <span className="truncate text-[13px] font-medium text-foreground">
            {prettyToolName(item.toolName)}
          </span>
          {item.requestedAt !== undefined && (
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Clock3 className="size-3" />
              {formatRequestedAt(item.requestedAt)}
            </span>
          )}
        </div>
        {item.sessionId && (
          <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground/80">
            session {item.sessionId.slice(0, 20)}
          </div>
        )}
        {item.diff && <DiffViewer diff={item.diff} maxHeight="max-h-40" />}
      </div>
      <div className="flex items-center gap-1.5 border-t border-border/50 px-3 py-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("approve")}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-transform active:scale-[0.97] hover:opacity-90 disabled:opacity-50"
        >
          <Check className="size-3.5" />
          允许
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("deny")}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background/40 px-2.5 text-[12.5px] text-foreground transition-transform active:scale-[0.97] hover:bg-surface-hover disabled:opacity-50"
        >
          <X className="size-3.5" />
          拒绝
        </button>
      </div>
    </div>
  );
}

export function ApprovalsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [approvals, setApprovals] = useState<PendingApprovalItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      const list = await fetchPendingApprovals();
      if (cancelled) return;
      setApprovals(list);
      setError(null);
    };
    void load();
    const timer = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open]);

  const handleDecide = async (approvalId: string, decision: "approve" | "deny") => {
    const ok = await approveTool(approvalId, decision);
    if (!ok) {
      setError("审批失败：请求可能已超时或不存在");
    }
    setApprovals(await fetchPendingApprovals());
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭审批面板"
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
          <ShieldQuestion className="size-4 text-warning" />
          <h2 className="text-[14px] font-semibold text-foreground">待审批</h2>
          {approvals.length > 0 && (
            <span className="inline-flex items-center rounded-sm border border-warning/35 bg-warning/10 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-warning">
              {approvals.length}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto inline-flex size-6.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {error}
            </div>
          )}
          {approvals.length === 0 && !error && (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <ShieldQuestion className="size-7 text-border-strong" />
              <p className="text-[13px] text-muted-foreground">当前没有待审批请求</p>
              <p className="max-w-[220px] text-[11.5px] leading-relaxed text-muted-foreground/70">
                需要确认的工具调用会出现在这里，也会触发托盘角标与系统通知。
              </p>
            </div>
          )}
          {approvals.map((item) => (
            <ApprovalCard key={item.approvalId} item={item} onDecide={handleDecide} />
          ))}
        </div>
      </motion.aside>
    </div>
  );
}
