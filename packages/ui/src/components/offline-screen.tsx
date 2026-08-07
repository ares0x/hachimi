import { RotateCw, ServerOff } from "lucide-react";

/**
 * P1: Daemon 离线恢复界面。
 * 当本地 API daemon 不可达时全屏展示，轮询恢复后自动消失。
 */
export function OfflineScreen({
  onRetry,
  checking = false,
}: {
  onRetry: () => void;
  checking?: boolean;
}) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-border/40 bg-surface-elevated/80 shadow-sm">
        <ServerOff className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h1 className="text-[15px] font-semibold text-foreground">无法连接 Hachimi 服务</h1>
        <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          本地 daemon 似乎未在运行。请确认服务已启动（如{" "}
          <code className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[12px]">
            pnpm dev:desktop
          </code>{" "}
          或{" "}
          <code className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[12px]">
            hachimi daemon
          </code>
          ），连接恢复后本页会自动刷新。
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={checking}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
      >
        <RotateCw className={checking ? "size-4 animate-spin" : "size-4"} />
        {checking ? "正在重试…" : "重试连接"}
      </button>
    </div>
  );
}
