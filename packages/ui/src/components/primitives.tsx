import { Check, CircleDashed, Clock, ShieldAlert, TriangleAlert } from "lucide-react";
import type { RunStatus } from "../lib/agent-demo";
import { cn } from "../lib/utils";

/** Hachimi logo mark: official brand avatar asset. */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/hachimi-mark.png"
      alt="Hachimi"
      className={cn("inline-block shrink-0 rounded-md object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function StatusDot({
  status = "done",
  pulse,
  className,
}: {
  status?: RunStatus;
  pulse?: boolean;
  className?: string;
}) {
  const color =
    status === "running"
      ? "bg-info"
      : status === "waiting"
        ? "bg-warning"
        : status === "error"
          ? "bg-danger"
          : status === "todo"
            ? "bg-border-strong"
            : "bg-success";
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        color,
        (pulse ?? status === "running") && "pulse-status",
        className
      )}
      aria-hidden
    />
  );
}

const STATUS_TEXT: Record<RunStatus, string> = {
  todo: "Todo",
  running: "Running",
  waiting: "Waiting",
  done: "Done",
  error: "Error",
};

export function StatusBadge({ status, label }: { status: RunStatus; label?: string }) {
  const tone =
    status === "running"
      ? "text-info border-info/35 bg-info/10"
      : status === "waiting"
        ? "text-warning border-warning/35 bg-warning/10"
        : status === "error"
          ? "text-danger border-danger/35 bg-danger/10"
          : status === "done"
            ? "text-success border-success/35 bg-success/10"
            : "text-muted-foreground border-border";
  const Icon =
    status === "running"
      ? CircleDashed
      : status === "waiting"
        ? Clock
        : status === "error"
          ? TriangleAlert
          : status === "done"
            ? Check
            : CircleDashed;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[11px] leading-4",
        tone
      )}
    >
      <Icon className={cn("size-3", status === "running" && "pulse-status")} />
      {label ?? STATUS_TEXT[status]}
    </span>
  );
}

export function SandboxBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-warning/35 bg-warning/10 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-warning">
      <ShieldAlert className="size-3" />
      sandbox
    </span>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-2 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Meta({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-xs text-muted-foreground", className)}>{children}</span>
  );
}
