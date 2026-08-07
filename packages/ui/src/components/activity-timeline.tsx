import { summarizeToolArgs } from "@hachimi/shared";
import {
  AlertTriangle,
  Bot,
  Brain,
  ChevronDown,
  CircleHelp,
  Copy,
  FileEdit,
  FileText,
  Folder,
  Gavel,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  TerminalSquare,
  Trash2,
  User,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { isTurnFinalAnswer } from "../lib/activity-utils";
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
  /** 用户消息附带的图片（data URL），历史缩略图渲染 */
  images?: string[];
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
    case "thinking":
      return Brain;
    default:
      return Wrench;
  }
}

/** Shortest readable tool name — drop the mcp_/tool_ prefixes. */
function shortToolName(name?: string): string {
  if (!name) return "tool";
  return name
    .replace(/^mcp_[a-z0-9_-]+_/, "")
    .replace(/^tool_/, "")
    .replace(/_/g, " ");
}

/** Extract the single most identifiable argument value (host / path / command). */
function keyArg(toolName: string, args?: Record<string, unknown>): string {
  if (!args) return "";
  const keys = Object.keys(args);
  if (keys.length === 0) return "";

  const priority: Record<string, string[]> = {
    run_command: ["command", "cmd"],
    mcp_fetch_url: ["url"],
    fetch_url: ["url"],
    read_file: ["path"],
    write_file: ["path"],
    delete_file: ["path"],
    replace_file_content: ["path"],
    list_dir: ["path"],
    grep_search: ["path", "pattern"],
    update_work_plan: ["workId"],
    delegate_subagent: ["taskDescription", "task"],
  };
  const ordered = priority[toolName] || [];
  for (const k of ordered) {
    if (args[k] !== undefined) return String(args[k]);
  }
  const v = String(args[keys[0]]);
  return v.length > 40 ? `${v.slice(0, 38)}…` : v;
}

/** Message bubbles — no rail, plain content. */
function MessageBubble({
  role,
  content,
  images,
  onRegenerate,
  onCopy,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
  onRegenerate?: (content: string) => void;
  onCopy?: (content: string) => void;
}) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[50rem]",
        isUser ? "flex justify-end" : "flex justify-start"
      )}
    >
      <div
        className={cn(
          "relative flex items-start gap-2",
          isUser
            ? "max-w-[75%] rounded-2xl border border-border/70 bg-surface-elevated px-3.5 py-2.5 text-[14.5px] leading-[1.6] text-foreground rounded-br-sm"
            : "max-w-full px-0 py-0 text-[15px] leading-[1.75] text-foreground"
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">
            {images && images.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {images.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`附件图片 ${i + 1}`}
                    className="max-h-52 rounded-lg border border-border/60 object-contain"
                  />
                ))}
              </div>
            )}
            {content}
          </div>
        ) : (
          <div className="group min-w-0 flex-1">
            <Markdown text={content} />
            {(onRegenerate || onCopy) && (
              <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {onCopy && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(content);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="inline-flex h-6 items-center gap-1 rounded-md px-2 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer"
                  >
                    <Copy className="size-3" />
                    {copied ? "已复制" : "复制"}
                  </button>
                )}
                {onRegenerate && (
                  <button
                    type="button"
                    onClick={() => onRegenerate(content)}
                    className="inline-flex h-6 items-center gap-1 rounded-md px-2 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer"
                  >
                    <RefreshCw className="size-3" />
                    重新生成
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function processIcon(step: ActivityStep, failed: boolean) {
  const Icon = failed
    ? XCircle
    : step.type === "thinking"
      ? Brain
      : step.type === "approval"
        ? CircleHelp
        : getToolIcon(step.toolName);
  return (
    <Icon
      className={cn("size-3.5 shrink-0", failed ? "text-danger" : "text-muted-foreground/60")}
    />
  );
}

/** One process footnote row — no border, no bg, hangs on the left rail. */
function ProcessRow({ step }: { step: ActivityStep }) {
  const failed = step.isToolError || step.type === "error";
  const pending = step.type === "approval" && step.approvalDecision === "pending";
  const [expanded, setExpanded] = useState(false);

  const name = shortToolName(step.toolName);
  const arg = keyArg(step.toolName || "", step.toolArgs);
  const dur = formatDuration(step.durationMs);

  // Summary line text
  let title: string;
  if (step.type === "thinking") {
    title = "Thinking";
  } else if (step.type === "approval") {
    title = pending
      ? `${name} · 等待授权`
      : `${name} · ${step.approvalDecision === "granted" ? "已授权" : "已拒绝"}`;
  } else {
    title = name;
  }

  return (
    <div className="group/row">
      <button
        type="button"
        onClick={() => (step.type !== "thinking" ? setExpanded((v) => !v) : setExpanded((v) => !v))}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-[5px] text-left transition-colors hover:bg-foreground/[0.04] rounded-md",
          failed && "text-danger",
          pending && "text-warning"
        )}
      >
        {processIcon(step, failed)}
        <span
          className={cn(
            "font-mono text-[12.5px]",
            failed ? "font-medium text-danger" : "text-foreground/85"
          )}
        >
          {title}
        </span>
        {arg && (
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground/70">
            {arg}
          </span>
        )}
        {dur && (
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground/50">{dur}</span>
        )}
        {(step.type === "thinking" || step.type === "tool") && (
          <ChevronDown
            className={cn(
              "size-3 shrink-0 text-muted-foreground/40 transition-transform",
              expanded && "rotate-180"
            )}
          />
        )}
      </button>
      {expanded && (step.type === "thinking" || step.type === "tool") && (
        <div className="ml-[22px] space-y-1.5 pb-1.5 pl-2.5 border-l border-border/50">
          {step.type === "thinking" && step.content && (
            <div className="whitespace-pre-wrap px-1 py-1 font-mono text-[12px] leading-relaxed text-muted-foreground">
              {step.content}
            </div>
          )}
          {step.type === "tool" && (
            <>
              {step.toolArgs && Object.keys(step.toolArgs).length > 0 && (
                <pre className="max-h-56 overflow-auto rounded-md bg-surface-elevated/70 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
                  {JSON.stringify(step.toolArgs, null, 2)}
                </pre>
              )}
              {(step.toolResult || step.content) && (
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-elevated/70 p-2 font-mono text-[12px] leading-relaxed text-foreground/85">
                  {step.toolResult || step.content}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact system footnote row — sub-agent notifications etc. No copy/regenerate. */
function SystemRow({ step }: { step: ActivityStep }) {
  const [expanded, setExpanded] = useState(false);
  const lines = (step.content || "").split("\n");
  const firstLine = lines[0] || "System";
  const summary = lines
    .slice(1)
    .join("\n")
    .replace(/^状态：\S+/, "")
    .replace(/^(结果摘要|错误)：\s*/, "")
    .trim();
  const detail = lines.slice(1).join("\n").trim();
  const hasDetail = detail.length > 0;
  return (
    <div className="mx-auto w-full max-w-[50rem] border-l border-border/40 pl-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-1 py-[4px] text-left transition-colors hover:bg-foreground/[0.04]"
      >
        <Bot className="size-3.5 shrink-0 text-muted-foreground/50" />
        <span className="shrink-0 font-mono text-[11.5px] text-foreground/75">{firstLine}</span>
        {summary && (
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground/50">
            {summary}
          </span>
        )}
        {hasDetail && (
          <ChevronDown
            className={cn(
              "size-3 shrink-0 text-muted-foreground/40 transition-transform",
              expanded && "rotate-180"
            )}
          />
        )}
      </button>
      {expanded && hasDetail && (
        <div className="ml-[22px] whitespace-pre-wrap break-words border-l border-border/50 pb-1.5 pl-2.5 font-mono text-[11.5px] leading-relaxed text-muted-foreground/70">
          {detail}
        </div>
      )}
    </div>
  );
}

/** Group of consecutive process steps — collapsed to one summary line by default. */
function ProcessGroup({ steps }: { steps: ActivityStep[] }) {
  const [expanded, setExpanded] = useState(false);

  const thoughtCount = steps.filter((s) => s.type === "thinking").length;
  const toolCount = steps.filter((s) => s.type === "tool").length;
  const pending = steps.some((s) => s.type === "approval" && s.approvalDecision === "pending");
  const totalMs = steps.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  const parts: string[] = [];
  if (thoughtCount > 0) parts.push(`${thoughtCount} thought${thoughtCount > 1 ? "s" : ""}`);
  if (toolCount > 0) parts.push(`${toolCount} tool${toolCount > 1 ? "s" : ""}`);
  const dur = formatDuration(totalMs);
  const summary = parts.length > 0 ? parts.join(" · ") : "Process";
  const tail = [dur, pending ? "需要授权" : null].filter(Boolean).join(" · ");

  const first = steps[0];
  const failed = steps.some((s) => s.isToolError || s.type === "error");
  const Icon = failed ? AlertTriangle : first?.type === "thinking" ? Brain : Gavel;

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[50rem] pl-4 border-l border-border/50",
        pending && "text-warning"
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 px-1 py-[4px] text-left transition-colors hover:bg-foreground/[0.04] rounded-md",
          pending && "animate-pulse"
        )}
      >
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            failed ? "text-danger" : pending ? "text-warning" : "text-muted-foreground/60"
          )}
        />
        <span className="font-mono text-[12px] font-medium text-muted-foreground">{summary}</span>
        {tail && <span className="font-mono text-[11px] text-muted-foreground/60">{tail}</span>}
        <ChevronDown
          className={cn(
            "ml-auto size-3.5 shrink-0 text-muted-foreground/50 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded && (
        <div className="mt-0.5 space-y-0">
          {steps.map((s) => (
            <ProcessRow key={s.id} step={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActiveRunningIndicator() {
  return (
    <div className="mx-auto w-full max-w-[50rem] pl-4 border-l border-border/50">
      <div className="flex items-center gap-2 px-1 py-1 text-xs text-foreground/70">
        <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
        <span className="font-mono text-[12px] text-foreground/80">Thinking…</span>
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
  onRegenerate?: (step: ActivityStep) => void;
  onCopyMessage?: (content: string) => void;
  className?: string;
}

export function ActivityTimeline({
  activities,
  steps,
  isRunning,
  onApprove,
  onDeny,
  onRegenerate,
  onCopyMessage,
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

  // Group consecutive non-message steps into process groups
  const rendered: React.ReactNode[] = [];
  let processGroup: ActivityStep[] = [];

  const flushGroup = () => {
    if (processGroup.length > 0) {
      rendered.push(<ProcessGroup key={`group-${processGroup[0].id}`} steps={processGroup} />);
      processGroup = [];
    }
  };

  for (let i = 0; i < items.length; i++) {
    const step = items[i];
    if (step.type === "system") {
      // P1: 系统级行（子代理通知等）独立渲染，不并入 process group
      flushGroup();
      rendered.push(<SystemRow key={step.id} step={step} />);
    } else if (step.type === "message") {
      flushGroup();
      rendered.push(
        <MessageBubble
          key={step.id}
          role={step.role === "assistant" ? "assistant" : "user"}
          content={step.content}
          images={step.images}
          onRegenerate={
            step.role === "assistant" && onRegenerate && isTurnFinalAnswer(items, i)
              ? () => onRegenerate(step)
              : undefined
          }
          onCopy={
            step.role === "assistant" && onCopyMessage && isTurnFinalAnswer(items, i)
              ? () => onCopyMessage(step.content)
              : undefined
          }
        />
      );
    } else {
      processGroup.push(step);
    }
  }
  flushGroup();

  return (
    <div className={cn("flex flex-col gap-y-4 py-5", className)}>
      {rendered}
      {showRunningIndicator && <ActiveRunningIndicator />}
    </div>
  );
}
