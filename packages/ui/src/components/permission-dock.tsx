import { ChevronDown, ChevronUp, FilePlus2, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import type { ToolArgSummary } from "../api";

export interface ToolArgSummaryField {
  key: string;
  label: string;
  value: string;
  truncated?: boolean;
  code?: boolean;
  mono?: boolean;
}

function prettyPermissionLabel(toolName?: string): string {
  switch (toolName) {
    case "write_file":
      return "写入文件";
    case "delete_file":
      return "删除文件";
    case "read_file":
      return "读取文件";
    case "list_dir":
      return "列出目录";
    case "run_command":
      return "执行命令";
    case "update_work_plan":
      return "更新工作计划";
    default:
      return toolName || "工具执行";
  }
}

function SummarizedField({ field }: { field: ToolArgSummaryField }) {
  const { value, code, mono, truncated } = field;
  const multiline = value.includes("\n");
  const [expanded, setExpanded] = useState(false);
  const collapsible = truncated || (multiline && value.length > 300);

  const displayValue =
    collapsible && !expanded
      ? value.split("\n").slice(0, 6).join("\n") + (value.split("\n").length > 6 ? "\n…" : "")
      : value;

  const baseClass = code
    ? "block whitespace-pre rounded-md bg-surface-elevated px-2.5 py-2 font-mono text-[12px] leading-[1.45] text-foreground overflow-x-auto"
    : mono
      ? "whitespace-pre break-all rounded bg-surface-elevated/70 px-1.5 py-0.5 font-mono text-[12.5px] text-foreground"
      : "text-[13px] leading-snug text-foreground";

  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {field.label}
      </div>
      <div className={baseClass}>{displayValue}</div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex h-6 items-center gap-0.5 rounded px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              收起
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              展开查看完整内容
            </>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * HITL: docked sheet above the composer (DESIGN_SYSTEM §8.10).
 * Global modals are reserved for irreversible cross-session actions.
 */
export function PermissionDock({
  toolName,
  args,
  argsSummary,
  onApprove,
  onApproveOnce,
  onApproveSession,
  onDeny,
}: {
  toolName?: string;
  args?: Record<string, unknown>;
  argsSummary?: ToolArgSummary;
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

  const label = prettyPermissionLabel(toolName);

  const summary = argsSummary ?? buildFallbackSummary(toolName, args);

  return (
    <div className="border-t border-border bg-surface px-4 pt-3 sm:px-6">
      <div className="enter-rise mx-auto w-full max-w-[52rem] rounded-lg border border-warning/40 bg-warning/10 p-3">
        <div className="flex items-start gap-2.5">
          <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="text-[13px] font-medium text-foreground">
                需要授权：{label}
                {toolName && toolName !== label && (
                  <span className="ml-1.5 font-mono text-[11.5px] text-muted-foreground">
                    ({toolName})
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Hachimi 请求执行{" "}
                <span className="font-mono text-foreground">{summary.oneLine}</span>
                。此操作在工作区内，可撤销。
              </p>
            </div>

            {summary.fields.length > 0 && (
              <div className="space-y-2.5 rounded-md border border-border/60 bg-background/70 p-2.5">
                {summary.fields.map((f) => (
                  <SummarizedField key={f.key} field={f} />
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
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

function buildFallbackSummary(toolName?: string, args?: Record<string, unknown>): ToolArgSummary {
  const safeArgs = args && typeof args === "object" ? args : {};
  const entries = Object.entries(safeArgs);
  const MAX = 400;
  const MAX_LINES = 12;

  const truncate = (s: string) => {
    let t = s;
    const byChars = t.length > MAX;
    if (byChars) t = t.slice(0, MAX);
    const lines = t.split("\n");
    const byLines = lines.length > MAX_LINES;
    if (byLines) t = lines.slice(0, MAX_LINES).join("\n");
    return { text: t, truncated: byChars || byLines };
  };

  const oneLine = entries.length
    ? `${toolName || "tool"}(${entries
        .map(([k, v]) => {
          const raw = typeof v === "string" ? v : JSON.stringify(v);
          return `${k}=${raw.length > 60 ? raw.slice(0, 60) + "…" : raw}`;
        })
        .join(", ")
        .slice(0, 160)}…)`
    : toolName || "tool";

  const fields: ToolArgSummaryField[] = entries.map(([k, v]) => {
    const raw = typeof v === "string" ? v : JSON.stringify(v, null, 2);
    const { text, truncated } = truncate(raw);
    const looksLikeCode =
      typeof v === "string" &&
      (raw.includes("\n") ||
        /(import|export|function|class|const|=|{|}|\)\s*=>)/.test(raw.slice(0, 200)));
    return {
      key: k,
      label: k,
      value: text + (truncated ? "\n…[内容已截断]" : ""),
      truncated,
      code: looksLikeCode,
      mono: true,
    };
  });

  return { oneLine, fields };
}
