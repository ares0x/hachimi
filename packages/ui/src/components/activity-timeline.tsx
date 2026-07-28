import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  FileEdit,
  Gavel,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  ThumbsDown,
  ThumbsUp,
  User,
  Wrench,
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
  | "system";

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
  /** approval type */
  approvalId?: string;
  approvalDecision?: "granted" | "denied" | "pending";
  /** internal status icon override */
  iconLabel?: string;
}

const TYPE_ICON: Record<ActivityType, typeof User> = {
  message: User,
  tool: Wrench,
  approval: Gavel,
  steer: Zap,
  error: AlertTriangle,
  system: Bot,
};

const TYPE_BG: Record<ActivityType, string> = {
  message: "",
  tool: "",
  approval: "",
  steer: "bg-warning/8",
  error: "bg-danger/8",
  system: "bg-muted/5",
};

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
        isUser ? "flex justify-end" : "flex justify-start",
      )}
    >
      <div
        className={cn(
          "relative flex max-w-[92% items-start gap-2 rounded-2xl px-3.5 py-2.5",
          isUser
            ? "bg-primary/92 text-primary-foreground rounded-br-md text-[14px] leading-[1.55] text-foreground rounded-br-sm shadow-xs"
            : "bg-transparent px-0 py-0 text-[14.5px] leading-[1.65] text-foreground",
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

export type ApprovalBlockProps = {
  step: ActivityStep;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
};
export type ToolBlockProps = { step: ActivityStep };
export type MessageBubbleProps = {
  role: "user" | "assistant" | "system";
  content: string;
};
export type GenericBlockProps = {
  step: ActivityStep;
  tone: "steer" | "error" | "system";
  title: string;
};
export type GoalPanelProps = {
  goal?: string;
  workId: string;
  onChange?: (newGoal: string) => void;
  defaultCollapsed?: boolean;
  className?: string;
};
export type PlanTrackerProps = {
  steps: Array<{
    id: string;
    title: string;
    description?: string;
    status: "pending" | "running" | "done" | "skipped";
    completedAt?: string;
  }>;
  defaultCollapsed?: boolean;
  onStepClick?: (step: {
    id: string;
    title: string;
    description?: string;
    status: "pending" | "running" | "done" | "skipped";
    completedAt?: string;
  }) => void;
  className?: string;
};

function ToolBlock({
  step,
}: {
  step: Extract<ActivityStep, { type: "tool" }> | ActivityStep;
}) {
  const [expanded, setExpanded] = useState(false);
  const resultRaw = step.toolResult || step.content || "";
  const isLong = resultRaw.length > 400 || resultRaw.split("\n").length > 10;
  const display =
    isLong && !expanded
      ? resultRaw.split("\n").slice(0, 8).join("\n") + "\n…"
      : resultRaw;

  return (
    <div className="mx-auto w-full max-w-[48rem] px-4 sm:px-0">
      <div
        className={cn(
          "rounded-xl border",
          step.isToolError
            ? "border-danger/40 bg-danger/5"
            : "border-border bg-surface-elevated/70",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
          <TerminalSquare
            className={cn(
              "size-4 shrink-0",
              step.isToolError ? "text-danger" : "text-info",
            )}
          />
          <span
            className={cn(
              "font-mono text-[12.5px]",
              step.isToolError ? "text-danger" : "text-foreground font-medium",
            )}
          >
            {step.toolName || "tool"}
          </span>
          {step.isToolError && (
            <span className="ml-1 rounded-full bg-danger/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-danger">
              failed
            </span>
          )}
          <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
            {formatTime(step.timestamp)}
          </span>
        </div>
        {step.toolArgs && Object.keys(step.toolArgs).length > 0 && (
          <details className="border-b border-border/40 px-3 py-2">
            <summary className="cursor-pointer list-none text-[11.5px] text-muted-foreground hover:text-foreground">
              参数 ({Object.keys(step.toolArgs).length} fields
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-background/70 p-2 font-mono text-[11px] leading-relaxed text-foreground/85">
              {JSON.stringify(step.toolArgs, null, 2)}
            </pre>
          </details>
        )}
        <div className="px-3 py-2.5">
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-foreground/90">
            {display}
          </pre>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              {expanded ? (
                <>
                  <ChevronUp className="size-3" /> 收起
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" /> 展开完整内容
                </>
              )}
            </button>
          )}
        </div>
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
          "rounded-xl border p-3",
          isPending
            ? "border-warning/50 bg-warning/8"
            : isGranted
              ? "border-success/40 bg-success/8"
              : "border-danger/40 bg-danger/8",
        )}
      >
        <div className="flex items-start gap-2">
          <Icon
            className={cn(
              "mt-0.5 size-4 shrink-0",
              isPending
                ? "text-warning"
                : isGranted
                  ? "text-success"
                  : "text-danger",
            )}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[12.5px] font-medium text-foreground">
                {step.toolName || "tool"}
              </span>
              <span
                className={cn(
                  "ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  isPending
                    ? "bg-warning/15 text-warning"
                    : isGranted
                      ? "bg-success/15 text-success"
                      : "bg-danger/15 text-danger",
                )}
              >
                {isPending ? "等待审批" : isGranted ? "已批准" : "已拒绝"}
              </span>
              <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                {formatTime(step.timestamp)}
              </span>
            </div>
            <p className="text-[13px] text-foreground/90">{step.content}</p>

            {isPending && onApprove && onDeny && step.approvalId && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onApprove(step.approvalId!)}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-success/25 px-2.5 text-[12px] font-medium text-success-contrast? hover:bg-success/35"
                  style={{ color: "oklch(0.55 0.15 145)" }}
                >
                  <ThumbsUp className="size-3.5" />
                  批准
                </button>
                <button
                  type="button"
                  onClick={() => onDeny(step.approvalId!)}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-danger/15 px-2.5 text-[12px] font-medium text-danger hover:bg-danger/25"
                >
                  <ThumbsDown className="size-3.5" />
                  拒绝
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
  const color =
    tone === "error"
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
      <div
        className={cn("flex items-start gap-2 rounded-xl border p-3", color.bg)}
      >
        <Icon className={cn("mt-0.5 size-4 shrink-0", color.tint)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wide">
              {title}
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

export interface ActivityTimelineProps {
  activities?: ActivityStep[];
  steps?: ActivityStep[];
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
  className?: string;
  /** 滚动锚点，用于消息与 activity 混排时的辅助，目前纯时间线专用。*/
}

/**
 * W3.3: 主区 Activity 时间线 — Work-first UI 的主体消息/工具/审批/纠偏流
 * 直接投影自 WorkManager.listActivities
 */
export function ActivityTimeline({
  activities,
  steps,
  onApprove,
  onDeny,
  className,
}: ActivityTimelineProps) {
  const items = activities ?? steps ?? [];
  if (!items || items.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center pb-20",
          className,
        )}
      >
        <div className="text-center">
          <FileEdit className="mx-auto mb-3 size-10 text-muted-foreground/50" />
          <p className="text-[13px] text-muted-foreground">
            尚无活动记录，开始对话后将在此显示执行轨迹。
          </p>
        </div>
      </div>
    );
  }

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
          case "approval":
            return (
              <ApprovalBlock
                key={step.id}
                step={step}
                onApprove={onApprove}
                onDeny={onDeny}
              />
            );
          case "steer":
            return (
              <GenericBlock
                key={step.id}
                step={step}
                tone="steer"
                title="纠偏干预"
              />
            );
          case "error":
            return (
              <GenericBlock
                key={step.id}
                step={step}
                tone="error"
                title="执行错误"
              />
            );
          default:
            return (
              <GenericBlock
                key={step.id}
                step={step}
                tone="system"
                title="系统事件"
              />
            );
        }
      })}
    </div>
  );
}
