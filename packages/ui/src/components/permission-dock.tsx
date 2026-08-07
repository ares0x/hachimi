import { ChevronDown, ChevronUp, Globe, Monitor, ShieldAlert, ShieldQuestion } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type { ToolArgSummary } from "../api";
import { DiffViewer } from "./diff-viewer";

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
    // Browser tools
    case "browser_navigate":
      return "浏览器 · 导航";
    case "browser_snapshot":
      return "浏览器 · 截图";
    case "browser_click":
      return "浏览器 · 点击";
    case "browser_type":
      return "浏览器 · 输入";
    case "browser_wait":
      return "浏览器 · 等待";
    // Computer Use tools
    case "computer_screenshot":
      return "系统 · 屏幕截图";
    case "computer_click":
      return "系统 · 鼠标点击";
    case "computer_type":
      return "系统 · 键盘输入";
    default:
      return toolName || "工具执行";
  }
}

/** Returns true when the tool belongs to the browser domain */
function isBrowserTool(toolName?: string): boolean {
  return !!toolName?.startsWith("browser_");
}

/** Returns true when the tool belongs to the computer-use domain */
function isComputerTool(toolName?: string): boolean {
  return !!toolName?.startsWith("computer_");
}

/**
 * Renders a one-line plain-English action summary for browser_* tools.
 * Matches the maka-agent renderBrowserSummary pattern.
 */
function renderBrowserOneLine(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "browser_navigate":
      return `导航至 ${String(args.url ?? "")}`;
    case "browser_snapshot":
      return `捕获页面截图${args.fullPage ? "（完整页面）" : ""}`;
    case "browser_click":
      if (args.selector) return `点击元素 ${String(args.selector)}`;
      if (args.x !== undefined) return `点击坐标 (${args.x}, ${args.y})`;
      return "点击页面元素";
    case "browser_type":
      return `在 ${String(args.selector ?? "输入框")} 中输入：${String(args.text ?? "").slice(0, 60)}`;
    case "browser_wait":
      return args.selector ? `等待元素 ${String(args.selector)}` : "等待页面加载";
    default:
      return toolName;
  }
}

/**
 * Computer Use Red-Dot Preview:
 * Renders a visual crosshair indicator at the target (x, y) position
 * within a scaled representation of the display, so the user knows exactly
 * where the mouse will click before approving.
 */
function ComputerRedDotPreview({
  x,
  y,
  displayW = 1440,
  displayH = 900,
}: {
  x: number;
  y: number;
  displayW?: number;
  displayH?: number;
}) {
  const previewW = 240;
  const previewH = Math.round((displayH / displayW) * previewW);
  const dotX = Math.round((x / displayW) * previewW);
  const dotY = Math.round((y / displayH) * previewH);

  return (
    <div className="mt-2.5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        目标位置预览
      </div>
      <div
        className="relative overflow-hidden rounded-md border border-border/70 bg-zinc-900"
        style={{ width: previewW, height: previewH }}
      >
        {/* Grid overlay to simulate desktop */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(to right, #666 1px, transparent 1px), linear-gradient(to bottom, #666 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
        {/* Red pulsing dot at target coordinate */}
        <motion.div
          className="absolute flex items-center justify-center"
          style={{
            left: dotX - 10,
            top: dotY - 10,
            width: 20,
            height: 20,
          }}
        >
          {/* Pulse ring */}
          <motion.div
            className="absolute rounded-full border-2 border-red-500"
            animate={{ scale: [1, 2, 1], opacity: [0.8, 0, 0.8] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ width: 20, height: 20 }}
          />
          {/* Solid dot */}
          <div className="size-2.5 rounded-full bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.6)]" />
        </motion.div>
        {/* Crosshair lines */}
        <div
          className="absolute bg-red-500/40"
          style={{ left: dotX, top: 0, width: 1, height: previewH }}
        />
        <div
          className="absolute bg-red-500/40"
          style={{ left: 0, top: dotY, width: previewW, height: 1 }}
        />
        {/* Coordinate label */}
        <div className="absolute bottom-1 right-1.5 rounded bg-black/60 px-1 py-0.5 font-mono text-[10px] text-red-300">
          ({x}, {y})
        </div>
      </div>
    </div>
  );
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
  diff,
  onApprove,
  onApproveOnce,
  onApproveSession,
  onDeny,
}: {
  toolName?: string;
  args?: Record<string, unknown>;
  argsSummary?: ToolArgSummary;
  diff?: string;
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
  const isBrowser = isBrowserTool(toolName);
  const isComputer = isComputerTool(toolName);
  const isDangerous = isComputer;

  const summary = argsSummary ?? buildFallbackSummary(toolName, args);
  const meta = buildMetadataLine(toolName, args);

  // For browser tools, build a richer one-line description
  const oneLine =
    isBrowser && toolName && args
      ? renderBrowserOneLine(toolName, args)
      : summary.oneLine || `执行 ${label}`;

  // For computer_click, extract coordinates for red-dot preview
  const showRedDot =
    toolName === "computer_click" &&
    args !== undefined &&
    typeof args.x === "number" &&
    typeof args.y === "number";

  // Rail color: red for dangerous (computer_click/type), amber for needs_confirm, default for safe
  const railColor = isDangerous ? "border-destructive/80" : "border-warning/70";
  const iconEl = isComputer ? (
    <Monitor className="mt-[2px] size-4 shrink-0 text-destructive" />
  ) : isBrowser ? (
    <Globe className="mt-[2px] size-4 shrink-0 text-warning" />
  ) : (
    <ShieldQuestion className="mt-[2px] size-4 shrink-0 text-warning" />
  );

  return (
    <div className="border-t border-border bg-surface px-4 pt-3 sm:px-6">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
        className="mx-auto w-full max-w-[50rem] overflow-hidden rounded-lg border border-border/70 bg-surface-elevated"
      >
        {/* Left 2px rail: amber for warn, red for dangerous */}
        <div className={`border-l-2 ${railColor}`}>
          <div className="flex items-start gap-2.5 px-3.5 py-3">
            {iconEl}
            <div className="min-w-0 flex-1">
              {/* Dangerous Computer Use banner */}
              {isDangerous && (
                <div className="mb-1.5 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1">
                  <ShieldAlert className="size-3 text-destructive" />
                  <span className="text-[11.5px] font-medium text-destructive">
                    高危操作 · 将直接控制系统鼠标/键盘，请仔细确认
                  </span>
                </div>
              )}
              {/* One-line action phrase + mono metadata */}
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[13.5px] font-medium text-foreground">
                  {oneLine}
                </span>
              </div>
              {meta && (
                <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted-foreground/80">
                  {meta}
                </div>
              )}

              {/* Computer Use red-dot target preview */}
              {showRedDot && <ComputerRedDotPreview x={args!.x as number} y={args!.y as number} />}

              {/* Real-time Preflight Unified Diff Preview */}
              {diff && <DiffViewer diff={diff} />}

              {/* Details collapsed by default */}
              {summary.fields.length > 0 && <DetailDisclosure fields={summary.fields} />}
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-t border-border/50 px-3.5 py-2">
            <button
              type="button"
              onClick={handleApprove}
              className="inline-flex h-7.5 items-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-transform active:scale-[0.97] hover:opacity-90"
            >
              允许
            </button>
            <button
              type="button"
              onClick={handleApproveSession}
              className="inline-flex h-7.5 items-center rounded-md border border-border bg-background/40 px-2.5 text-[12.5px] text-foreground transition-transform active:scale-[0.97] hover:bg-surface-hover"
            >
              始终允许此命令
            </button>
            <button
              type="button"
              onClick={onDeny}
              className="ml-auto inline-flex h-7.5 items-center rounded-md px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground active:scale-[0.97]"
            >
              拒绝
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** Single disclosure row for full args — no per-field uppercase form. */
function DetailDisclosure({ fields }: { fields: ToolArgSummaryField[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        查看内容
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {fields.map((f) => (
            <SummarizedField key={f.key} field={f} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact metadata line: bytes · lines · mode · reversible. */
function buildMetadataLine(toolName?: string, args?: Record<string, unknown>): string | null {
  if (!args || typeof args !== "object") return null;
  const parts: string[] = [];

  if (typeof args.content === "string") {
    const bytes = Buffer.byteLength(args.content, "utf-8");
    const lines = args.content.split("\n").length;
    parts.push(`${bytes} B · ${lines} lines`);
  }
  if (toolName === "delete_file") {
    parts.push("不可恢复");
  } else if (toolName === "write_file" || toolName === "replace_file_content") {
    parts.push("可撤销");
  } else if (toolName === "run_command") {
    parts.push("沙箱内执行");
  }

  return parts.length > 0 ? parts.join(" · ") : null;
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
          const clipped = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
          return `${k}=${clipped}`;
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
