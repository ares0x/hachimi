import { FilePlus2, ShieldQuestion } from "lucide-react";

/**
 * HITL: docked sheet above the composer (DESIGN_SYSTEM §8.10).
 * Global modals are reserved for irreversible cross-session actions.
 */
export function PermissionDock({
  toolName,
  args,
  onApprove,
  onApproveOnce,
  onApproveSession,
  onDeny,
}: {
  toolName?: string;
  args?: string;
  onApprove?: () => void;
  onApproveOnce?: () => void;
  onApproveSession?: () => void;
  onDeny: () => void;
}) {
  const handleApprove = () => {
    if (onApproveOnce) onApproveOnce();
    else if (onApprove) onApprove();
  };

  const handleApproveSession = () => {
    if (onApproveSession) onApproveSession();
    else if (onApprove) onApprove();
  };

  return (
    <div className="border-t border-border bg-surface px-4 pt-3 sm:px-6">
      <div className="enter-rise mx-auto w-full max-w-[52rem] rounded-lg border border-warning/40 bg-warning/10 p-3">
        <div className="flex items-start gap-2.5">
          <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-foreground">
              需要授权：{toolName || "写入文件"}
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Hachimi 请求执行{" "}
              <span className="font-mono text-foreground">{toolName || "dangerous_tool"}</span>
              {args && (
                <code className="ml-1 rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs">
                  {args}
                </code>
              )}
              。 此操作在工作区内，可撤销。
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApprove}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <FilePlus2 className="size-3.5" />
                允许一次
              </button>
              <button
                type="button"
                onClick={handleApproveSession}
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface-elevated px-2.5 text-[13px] text-foreground transition-colors hover:bg-surface-hover"
              >
                本会话内始终允许
              </button>
              <button
                type="button"
                onClick={onDeny}
                className="inline-flex h-8 items-center rounded-md px-2.5 text-[13px] text-danger transition-colors hover:bg-danger/10"
              >
                拒绝
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
