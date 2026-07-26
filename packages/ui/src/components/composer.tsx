import { AtSign, Paperclip, Slash, Square, ArrowUp, Zap } from "lucide-react";
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
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onSteer?: () => void;
  onStop?: () => void;
  running?: boolean;
  mode?: Mode;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!running && !disabled) ref.current?.focus();
  }, [running, disabled]);

  return (
    <div className="border-t border-border bg-background px-4 pt-3 pb-4 sm:px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!running && value.trim()) {
            onSubmit();
          }
        }}
        className="mx-auto w-full max-w-[52rem]"
      >
        <div className="relative rounded-xl border border-border bg-surface-elevated transition-all duration-150 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30">
          <textarea
            ref={ref}
            rows={2}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                e.preventDefault();
                if (!running && value.trim()) {
                  onSubmit();
                }
              }
            }}
            placeholder={disabled ? "等待授权决定…" : "描述目标，Hachimi 会先给计划再执行…"}
            className="scroll-quiet block w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1 text-[14px] leading-6 text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
            style={{ outline: "none", boxShadow: "none" }}
          />
          <div className="flex items-center gap-1 px-3 pb-2.5 pt-1">
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
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>

            <span className="ml-1 hidden font-mono text-[11px] text-muted-foreground sm:inline">
              {MODE_LABEL[mode || "chat"]} · ⌘Enter 发送
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
                  {onSteer && (
                    <button
                      type="button"
                      onClick={onSteer}
                      disabled={disabled || !value.trim()}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 font-mono text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-40"
                      title="在当前回合插入纠偏指令，不新建用户消息"
                    >
                      <Zap className="size-3" />
                      <span>⚡ 插入纠偏</span>
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={disabled || !value.trim()}
                    className={cn(
                      "grid size-7 place-items-center rounded-md bg-primary text-primary-foreground transition-opacity",
                      (disabled || !value.trim()) && "cursor-not-allowed opacity-40"
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
