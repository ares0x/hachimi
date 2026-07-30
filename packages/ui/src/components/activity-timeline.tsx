import { summarizeToolArgs } from "@hachimi/shared";
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileEdit,
  FileText,
  Folder,
  Gavel,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { Markdown } from "./markdown";

export type ActivityType =
  | "message"
  | "tool"
  | "approval"
  | "steer"
  | "error"
  | "system"
  | "thinking";

export interface ActivityStep {
  id: string;
  type: ActivityType;
  timestamp: string;
  role?: "user" | "assistant" | "system";
  content: string;
  /** tool type */
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  isToolError?: boolean;
  durationMs?: number;
  isRunning?: boolean;
  /** approval type */
  approvalId?: string;
  approvalDecision?: "granted" | "denied" | "pending";
  /** internal status icon override */
  iconLabel?: string;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDuration(ms?: number): string | null {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function getToolIcon(toolName?: string) {
  if (!toolName) return Wrench;
  switch (toolName) {
    case "read_file":
      return FileText;
    case "write_file":
    case "replace_file_content":
      return FileEdit;
    case "delete_file":
      return Trash2;
    case "list_dir":
      return Folder;
    case "grep_search":
      return Search;
    case "run_command":
      return TerminalSquare;
    case "delegate_subagent":
    case "check_subagent_status":
      return Bot;
    case "activate_skill":
      return Zap;
    case "thinking":
      return Brain;
    default:
      return Wrench;
  }
}

function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant" | "system";
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[48rem] px-4 sm:px-0",
        isUser ? "flex justify-end" : "flex justify-start"
      )}
    >
      <div
        className={cn(
          "relative flex max-w-[92%] items-start gap-2 rounded-2xl px-3.5 py-2.5",
          isUser
            ? "bg-primary/92 text-primary-foreground selection:bg-white/30 selection:text-white rounded-br-sm text-[14px] leading-[1.55] shadow-xs"
            : "bg-transparent px-0 py-0 text-[14.5px] leading-[1.65] text-foreground selection:bg-primary/20"
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{content}</div>
        ) : (
          <div className="min-w-0 flex-1">
            <Markdown text={content} />
          </div>
        )}
      </div>
    </div>
  );
}

function toolSummary(step: ActivityStep): string {
  const name = step.toolName || "tool";
  if (step.toolArgs && typeof step.toolArgs === "object" && Object.keys(step.toolArgs).length > 0) {
    const summary = summarizeToolArgs(name, step.toolArgs as Record<string, unknown>);
    if (summary?.oneLine) {
      return summary.oneLine;
    }
  }
  const result = step.toolResult || step.content || "";
  const firstLine = result.split("\n").find((l) => l.trim()) || "";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine || name;
}

function ToolBlock({ step }: { step: Extract<ActivityStep, { type: "tool" }> | ActivityStep }) {
  const [expanded, setExpanded] = useState(false);
  const resultRaw = step.toolResult || step.content || "";
  const summary = toolSummary(step);
  const ToolIcon = getToolIcon(step.toolName);
  const durationText = formatDuration(step.durationMs);
  const isRunning = step.isRunning;

  return (
    <div className="mx-auto w-full max-w-[48rem] px-4 sm:px-0">
      <div
        className={cn(
          "rounded-xl border transition-all duration-200 shadow-xs",
          step.isToolError
            ? "border-danger/40 bg-danger/5"
            : isRunning
              ? "border-primary/40 bg-primary/5 animate-pulse"
              : expanded
                ? "border-border bg-surface-elevated/70"
                : "border-border/40 bg-surface/50 hover:border-border hover:bg-surface-elevated/60"
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left"
        >
          <ToolIcon
            className={cn(
              "size-4 shrink-0 transition-colors",
              step.isToolError
                ? "text-danger"
                : isRunning
                  ? "text-primary animate-spin"
                  : "text-muted-foreground/80"
            )}
          />

          <span
            className={cn(
              "min-w-0 flex-1 truncate font-mono text-[12px] font-medium tracking-tight",
              step.isToolError ? "text-danger" : "text-foreground/90"
            )}
          >
            {summary}
          </span>

          {/* Status Indicator: Checkmark, Error, or Running Spinner */}
          {isRunning ? (
            <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
          ) : step.isToolError ? (
            <XCircle className="size-3.5 text-danger shrink-0" />
          ) : (
            <CheckCircle2 className="size-3.5 text-emerald-500/90 shrink-0" />
          )}

          {/* Duration Badge */}
          {durationText && (
            <span className="shrink-0 rounded-md bg-muted/40 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground/80">
              {durationText}
            </span>
          )}

          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </button>
        {expanded && (
          <>
            {step.toolArgs && Object.keys(step.toolArgs).length > 0 && (
              <details className="border-t border-border/40 px-3.5 py-2" open>
                <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground">
                  Arguments ({Object.keys(step.toolArgs).length})
                </summary>
                <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-background/80 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/85 border border-border/30">
                  {JSON.stringify(step.toolArgs, null, 2)}
                </pre>
              </details>
            )}
            <div className="border-t border-border/40 px-3.5 py-2.5">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Output
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/60 p-2.5 font-mono text-[12px] leading-relaxed text-foreground/90 border border-border/20">
                {resultRaw}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ThinkingBlock({ step }: { step: ActivityStep }) {
  const [expanded, setExpanded] = useState(false);
  const durationText = formatDuration(step.durationMs);
  const firstLine = (step.content || "").split("\n").find((l) => l.trim()) || "Thinking process";
  const previewText = firstLine.length > 70 ? `${firstLine.slice(0, 70)}…` : firstLine;

  return (
    <div className="mx-auto w-full max-w-[48rem] px-4 sm:px-0">
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors shadow-2xs">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 px-3.5 py-2 text-left"
        >
          <Brain className="size-4 text-purple-400 shrink-0" />
          <span className="font-mono text-[12px] font-medium text-purple-300/90 shrink-0">
            Thought {durationText ? `for ${durationText}` : ""}
          </span>
          {!expanded && (
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground/70 italic">
              — {previewText}
            </span>
          )}
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 text-muted-foreground/50 transition-transform duration-200 shrink-0",
              expanded && "rotate-180"
            )}
          />
        </button>
        {expanded && (
          <div className="border-t border-purple-500/20 px-3.5 py-2.5 bg-background/50 rounded-b-xl">
            <div className="text-[12.5px] leading-relaxed text-muted-foreground/90 whitespace-pre-wrap font-mono">
              {step.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalBlock({
  step,
  onApprove,
  onDeny,
}: {
  step: Extract<ActivityStep, { type: "approval" }> | ActivityStep;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
}) {
  const isPending = step.approvalDecision === "pending";
  const isGranted = step.approvalDecision === "granted";
  const Icon = isGranted
    ? ShieldCheck
    : step.approvalDecision === "denied"
      ? ShieldAlert
      : CircleHelp;

  return (
    <div className="mx-auto w-full max-w-[48rem] px-4 sm:px-0">
      <div
        className={cn(
          "rounded-xl border p-3.5 shadow-xs",
          isPending
            ? "border-warning/50 bg-warning/8"
            : isGranted
              ? "border-success/40 bg-success/8"
              : "border-danger/40 bg-danger/8"
        )}
      >
        <div className="flex items-start gap-2.5">
          <Icon
            className={cn(
              "mt-0.5 size-4.5 shrink-0",
              isPending ? "text-warning" : isGranted ? "text-success" : "text-danger"
            )}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[12.5px] font-semibold text-foreground">
                {step.toolName || "tool"}
              </span>
              <span
                className={cn(
                  "ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider font-semibold",
                  isPending
                    ? "bg-warning/15 text-warning"
                    : isGranted
                      ? "bg-success/15 text-success"
                      : "bg-danger/15 text-danger"
                )}
              >
                {isPending ? "Pending Approval" : isGranted ? "Approved" : "Denied"}
              </span>
              <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                {formatTime(step.timestamp)}
              </span>
            </div>
            <p className="text-[13px] text-foreground/90 leading-relaxed">{step.content}</p>

            {isPending && onApprove && onDeny && step.approvalId && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onApprove(step.approvalId!)}
                  className="inline-flex h-7.5 items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 text-[12px] font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                >
                  <ThumbsUp className="size-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onDeny(step.approvalId!)}
                  className="inline-flex h-7.5 items-center gap-1.5 rounded-lg bg-danger/20 px-3 text-[12px] font-semibold text-danger hover:bg-danger/30 transition-colors"
                >
                  <ThumbsDown className="size-3.5" />
                  Deny
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GenericBlock({
  step,
  tone,
  title,
}: {
  step: ActivityStep;
  tone: "steer" | "error" | "system";
  title: string;
}) {
  const isCancel = step.content?.includes("已取消") || step.content?.includes("Cancelled");
  const displayTitle = isCancel ? "INTERRUPTED" : title;

  const color = isCancel
    ? {
        icon: XCircle,
        tint: "text-muted-foreground",
        bg: "bg-muted/30 border-border/50",
      }
    : tone === "error"
      ? {
          icon: AlertTriangle,
          tint: "text-danger",
          bg: "bg-danger/8 border-danger/30",
        }
      : tone === "steer"
        ? {
            icon: Zap,
            tint: "text-warning",
            bg: "bg-warning/8 border-warning/30",
          }
        : { icon: Bot, tint: "text-info", bg: "bg-info/8 border-info/30" };
  const Icon = color.icon;

  return (
    <div className="mx-auto w-full max-w-[48rem] px-4 sm:px-0">
      <div className={cn("flex items-start gap-2.5 rounded-xl border p-3.5 shadow-xs", color.bg)}>
        <Icon className={cn("mt-0.5 size-4 shrink-0", color.tint)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wide">
              {displayTitle}
            </span>
            <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
              {formatTime(step.timestamp)}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {step.content}
          </p>
        </div>
      </div>
    </div>
  );
}

function ActiveRunningIndicator() {
  return (
    <div className="mx-auto w-full max-w-[48rem] px-4 sm:px-0">
      <div className="flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs text-foreground/80 shadow-xs animate-pulse">
        <Loader2 className="size-4 animate-spin text-primary shrink-0" />
        <span className="font-mono text-[12.5px] font-medium text-foreground/90">
          Thinking & executing tasks...
        </span>
      </div>
    </div>
  );
}

export interface ActivityTimelineProps {
  activities?: ActivityStep[];
  steps?: ActivityStep[];
  isRunning?: boolean;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
  className?: string;
}

export function ActivityTimeline({
  activities,
  steps,
  isRunning,
  onApprove,
  onDeny,
  className,
}: ActivityTimelineProps) {
  const items = activities ?? steps ?? [];
  if ((!items || items.length === 0) && !isRunning) {
    return (
      <div className={cn("flex h-full items-center justify-center pb-20", className)}>
        <div className="text-center">
          <FileEdit className="mx-auto mb-3 size-10 text-muted-foreground/50" />
          <p className="text-[13px] text-muted-foreground">
            No activity history yet. Start a conversation to view real-time execution trace.
          </p>
        </div>
      </div>
    );
  }

  const lastItem = items.length > 0 ? items[items.length - 1] : null;
  const showRunningIndicator =
    isRunning && (!lastItem || lastItem.type !== "message" || lastItem.role === "user");

  return (
    <div className={cn("flex flex-col gap-y-4 py-5", className)}>
      {items.map((step) => {
        switch (step.type) {
          case "message":
            return (
              <div key={step.id}>
                <MessageBubble
                  role={step.role === "assistant" ? "assistant" : "user"}
                  content={step.content}
                />
              </div>
            );
          case "tool":
            return <ToolBlock key={step.id} step={step} />;
          case "thinking":
            return <ThinkingBlock key={step.id} step={step} />;
          case "approval":
            return (
              <ApprovalBlock key={step.id} step={step} onApprove={onApprove} onDeny={onDeny} />
            );
          case "steer":
            return <GenericBlock key={step.id} step={step} tone="steer" title="Steering" />;
          case "error":
            return <GenericBlock key={step.id} step={step} tone="error" title="Error" />;
          default:
            return <GenericBlock key={step.id} step={step} tone="system" title="System Event" />;
        }
      })}
      {showRunningIndicator && <ActiveRunningIndicator />}
    </div>
  );
}
