import { ArrowUp, AtSign, FolderKanban, Paperclip, Slash, Square, Zap } from "lucide-react";
import { useEffect, useRef } from "react";
import { MODE_LABEL, type Mode } from "../lib/agent-demo";
import { cn } from "../lib/utils";

export function Composer({
  value,
  onChange,
  onSubmit,
  onSteer,
  onStop,
  running,
  mode = "chat",
  disabled,
  workTitle,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onSteer?: () => void;
  onStop?: () => void;
  running?: boolean;
  mode?: Mode;
  disabled?: boolean;
  /** W3.4: 当前发言锚定的 Work 标题；空则显示未选中 */
  workTitle?: string | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!running && !disabled) ref.current?.focus();
  }, [running, disabled]);

  return (
    <div className="border-t border-border/40 bg-background px-4 pt-3 pb-4 sm:px-6">
      {/* W3.4: 显示当前发言锚定的 Work，带 shortcut 提示 */}
      <div className="mx-auto mb-2 flex w-full max-w-[48rem] items-center gap-1.5 px-1 font-mono text-[11px] text-muted-foreground/75">
        <FolderKanban className="size-3" />
        <span className="truncate">
          In:{" "}
          <span className="text-foreground/85">
            {workTitle || "（未选中 Work，首次发送将自动创建）"}
          </span>
        </span>
        <span className="ml-auto hidden sm:inline">
          快捷键 · <span className="text-foreground/80">⌘ Enter</span> 发送 ·{" "}
          <span className="text-foreground/80">Shift Enter</span> 换行
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!running && value.trim()) {
            onSubmit();
          }
        }}
        className="mx-auto w-full max-w-[48rem]"
      >
        <div className="group relative rounded-2xl border border-border bg-surface-elevated shadow-[0_4px_20px_oklch(0.2_0.01_260_/0.06)] transition-all duration-200 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-[0_8px_30px_oklch(0.2_0.01_260_/0.09)]">
          <textarea
            ref={ref}
            rows={2}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // W3.4: 严格语义 — ⌘/Ctrl+Enter 发送，Shift+Enter 换行；
              // 裸 Enter 在单行时也发送（常见 UX），但保留 shift/meta 覆盖语义。
              if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey || (!e.shiftKey && !e.nativeEvent.isComposing))
              ) {
                e.preventDefault();
                if (!running && value.trim()) {
                  onSubmit();
                }
              }
            }}
            placeholder={
              disabled
                ? "等待授权决定…"
                : workTitle
                  ? `描述对「${workTitle.length > 30 ? workTitle.slice(0, 30) + "…" : workTitle}」的下一步需求…`
                  : "描述意图，Hachimi 会创建一个 Work 并先给出计划再执行…"
            }
            className="scroll-quiet block w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[14px] leading-6 text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
            style={{ outline: "none", boxShadow: "none" }}
          />
          <div className="flex items-center gap-1 px-3 pb-3 pt-1">
            <div className="flex items-center gap-0.5">
              {[
                { icon: AtSign, label: "引用上下文" },
                { icon: Slash, label: "斜杠命令" },
                { icon: Paperclip, label: "附加文件" },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>

            <span className="ml-1 hidden font-mono text-[11px] text-muted-foreground/60 transition-opacity group-focus-within:opacity-100 sm:inline">
              {MODE_LABEL[mode || "chat"]} · ⌘Enter 发送 · ShiftEnter 换行
            </span>

            <div className="ml-auto flex items-center gap-2">
              {running && onStop ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <Square className="size-3" />
                  <span>Stop</span>
                </button>
              ) : (
                <>
                  {running && onSteer && (
                    <button
                      type="button"
                      onClick={onSteer}
                      disabled={disabled || !value.trim()}
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-mono text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
                      title="纠偏当前 Work 的执行方向（在运行中回合中插入指令）"
                    >
                      <Zap className="size-3" />
                      <span>插队纠偏</span>
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={disabled || !value.trim()}
                    className={cn(
                      "grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity shadow-sm",
                      (disabled || !value.trim()) && "cursor-not-allowed opacity-30"
                    )}
                    aria-label="发送"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
