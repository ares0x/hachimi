import {
  Activity,
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronUp,
  Clock4,
  FileKey2,
  Gauge,
  ListTodo,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import type { ActivityStep as TimelineActivityStep } from "./activity-timeline";
import { Meta, SectionLabel, StatusBadge, StatusDot } from "./primitives";

export type InspectorCurrentStep = {
  id: string;
  title: string;
  status: "pending" | "running" | "done" | "skipped";
  description?: string;
};

export type InspectorMemoryItem = {
  id: string;
  kind: "preference" | "fact" | "constraint" | "project";
  text: string;
  when: string;
  hits: number;
};

export type InspectorToolItem = {
  name: string;
  permission: "safe" | "needs_confirm" | "dangerous";
  description: string;
};

export type InspectorApprovalWait = {
  approvalId: string;
  toolName: string;
  summary: string;
  sinceIso: string;
};

export type InspectorDevActivityItem = {
  id: string;
  type: string;
  timestamp: string;
  summary: string;
};

export interface InspectorData {
  currentStep?: InspectorCurrentStep;
  memories: InspectorMemoryItem[];
  activeTools: InspectorToolItem[];
  awaitingApproval?: InspectorApprovalWait;
  rawRecentEvents?: InspectorDevActivityItem[];
  tokens?: number;
  maxTokens?: number;
  requestId?: string;
  cost?: string | number;
}

const KIND_TINT: Record<InspectorMemoryItem["kind"], string> = {
  preference: "text-primary",
  fact: "text-info",
  constraint: "text-danger",
  project: "text-mode-research",
};

const PERM_TINT: Record<InspectorToolItem["permission"], string> = {
  safe: "border-success/40 bg-success/10 text-success",
  needs_confirm: "border-warning/40 bg-warning/10 text-warning",
  dangerous: "border-danger/40 bg-danger/10 text-danger",
};

const PERM_LABEL: Record<InspectorToolItem["permission"], string> = {
  safe: "safe",
  needs_confirm: "confirm",
  dangerous: "danger",
};

export function ContextPanel({ data, className }: { data: InspectorData; className?: string }) {
  const [devOpen, setDevOpen] = useState(false);
  const {
    currentStep,
    memories,
    activeTools,
    awaitingApproval,
    rawRecentEvents,
    tokens = 0,
    maxTokens = 12000,
    requestId,
    cost,
  } = data;

  return (
    <div className={cn("flex h-full flex-col border-l border-border bg-surface", className)}>
      {/* ─── User Layer (Default) ────────────────────────────────────────── */}
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-3 pb-0">
        {/* 1. 当前执行步骤 */}
        <section className="mb-4">
          <div className="flex items-center gap-1.5">
            <ListTodo className="size-3.5 text-primary" />
            <SectionLabel className="px-0">当前步骤</SectionLabel>
          </div>
          {currentStep ? (
            <div
              className={cn(
                "mt-2 rounded-lg border p-2.5",
                currentStep.status === "running"
                  ? "border-info/40 bg-info/5"
                  : currentStep.status === "done"
                    ? "border-success/40 bg-success/5"
                    : "border-border/60 bg-surface-elevated/60"
              )}
            >
              <div className="flex items-start gap-2">
                <StatusDot
                  status={
                    currentStep.status === "running"
                      ? "running"
                      : currentStep.status === "done"
                        ? "done"
                        : currentStep.status === "skipped"
                          ? "todo"
                          : "waiting"
                  }
                  className="mt-1 size-2"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {currentStep.title}
                  </div>
                  {currentStep.description && (
                    <Meta className="mt-0.5">{currentStep.description}</Meta>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 rounded-md border border-dashed border-border/60 px-2.5 py-2 text-[12px] text-muted-foreground/80">
              尚未开始，或当前没有在执行的 Plan 步骤。
            </p>
          )}
        </section>

        {/* 2. 等待审批（HITL） */}
        {awaitingApproval && (
          <section className="mb-4">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-warning" />
              <SectionLabel className="px-0">等待用户审批</SectionLabel>
            </div>
            <div className="mt-2 rounded-lg border border-warning/45 bg-warning/8 p-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-medium text-foreground">
                  {awaitingApproval.toolName}
                </span>
                <StatusBadge status="waiting" label="HITL" />
              </div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-foreground/85">
                {awaitingApproval.summary}
              </p>
              <Meta className="mt-1.5">
                等待中 · 自 {new Date(awaitingApproval.sinceIso).toLocaleTimeString()} 起
              </Meta>
            </div>
          </section>
        )}

        {/* 3. 本轮用到的记忆 */}
        <section className="mb-4">
          <div className="flex items-center gap-1.5">
            <Brain className="size-3.5 text-info" />
            <SectionLabel className="px-0">
              用到的记忆
              <span className="ml-1 text-muted-foreground/70">({memories.length})</span>
            </SectionLabel>
          </div>
          {memories.length === 0 ? (
            <p className="mt-2 rounded-md border border-dashed border-border/60 px-2.5 py-2 text-[12px] text-muted-foreground/75">
              本轮暂未检索到长期记忆。
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {memories.slice(0, 5).map((m) => (
                <li
                  key={m.id}
                  className="group rounded-lg border border-border bg-surface-elevated p-2 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "font-mono text-[10.5px] uppercase tracking-wide",
                        KIND_TINT[m.kind]
                      )}
                    >
                      {m.kind}
                    </span>
                    <Meta>· {m.when}</Meta>
                    <Meta className="ml-auto">{m.hits} hits</Meta>
                  </div>
                  <p className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-foreground/90">
                    {m.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 4. 可用工具 */}
        <section className="mb-4">
          <div className="flex items-center gap-1.5">
            <Wrench className="size-3.5 text-success" />
            <SectionLabel className="px-0">
              可用工具
              <span className="ml-1 text-muted-foreground/70">({activeTools.length})</span>
            </SectionLabel>
          </div>
          {activeTools.length === 0 ? (
            <p className="mt-2 rounded-md border border-dashed border-border/60 px-2.5 py-2 text-[12px] text-muted-foreground/75">
              当前未激活工具。
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {activeTools.slice(0, 10).map((t) => (
                <li
                  key={t.name}
                  className="flex items-start gap-2 rounded-md border border-border/60 bg-surface-elevated/60 px-2 py-1.5"
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex shrink-0 items-center rounded border px-1 font-mono text-[9.5px] uppercase tracking-wider",
                      PERM_TINT[t.permission]
                    )}
                  >
                    {PERM_LABEL[t.permission]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11.5px] text-foreground">{t.name}</div>
                    <Meta className="truncate">{t.description}</Meta>
                  </div>
                </li>
              ))}
              {activeTools.length > 10 && (
                <li className="text-center text-[11px] text-muted-foreground/70">
                  其余 {activeTools.length - 10} 个工具省略
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      {/* ─── Dev Layer (Collapsible, collapsed by default) ─────────────── */}
      <div className="border-t border-border bg-surface-elevated/40">
        <button
          type="button"
          onClick={() => setDevOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
        >
          <Activity className="size-3.5 text-muted-foreground" />
          <SectionLabel className="px-0">Dev / 诊断</SectionLabel>
          {devOpen ? (
            <ChevronUp className="ml-auto size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </button>

        {devOpen && (
          <div className="space-y-3 px-3 pb-3 pt-1">
            {/* Runtime tokens & cost */}
            <div className="rounded-lg border border-border/60 bg-surface p-2.5">
              <div className="flex items-center gap-2">
                <Gauge className="size-3.5 text-muted-foreground" />
                <SectionLabel className="px-0">Runtime & Sandbox</SectionLabel>
              </div>
              <dl className="mt-2 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-muted-foreground">
                  <dt>tokens</dt>
                  <dd className="text-foreground">
                    {tokens.toLocaleString()} / {maxTokens.toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>est. cost</dt>
                  <dd className="text-foreground">{cost ?? "$0.00"}</dd>
                </div>
                {requestId && (
                  <div className="flex justify-between text-muted-foreground">
                    <dt>req-id</dt>
                    <dd className="max-w-[60%] truncate text-foreground">{requestId}</dd>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <dt>sandbox</dt>
                  <dd className="text-success">
                    <ShieldCheck className="-mt-0.5 mr-1 inline size-3" />
                    PathJail · 30s cap
                  </dd>
                </div>
              </dl>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (tokens / maxTokens) * 100)}%` }}
                />
              </div>
            </div>

            {/* Recent events stream (latest 20) */}
            <div>
              <div className="flex items-center gap-2">
                <Clock4 className="size-3.5 text-muted-foreground" />
                <SectionLabel className="px-0">
                  原始事件流
                  <span className="ml-1 text-muted-foreground/70">
                    (最近 {rawRecentEvents?.length ?? 0})
                  </span>
                </SectionLabel>
              </div>
              {!rawRecentEvents || rawRecentEvents.length === 0 ? (
                <p className="mt-2 rounded-md border border-dashed border-border/60 px-2.5 py-2 text-[11.5px] text-muted-foreground/80">
                  暂无事件。
                </p>
              ) : (
                <ol className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                  {rawRecentEvents.slice(-20).map((ev, i) => (
                    <li
                      key={ev.id}
                      className="relative flex gap-2 rounded border border-border/60 bg-surface px-2 py-1.5"
                    >
                      <span className="w-[4%] shrink-0 pt-0.5 text-right font-mono text-[9.5px] text-muted-foreground/70">
                        {i + 1}
                      </span>
                      <span className="w-[22%] shrink-0 truncate font-mono text-[10.5px] text-primary/90">
                        {ev.type}
                      </span>
                      <span className="w-[24%] shrink-0 truncate font-mono text-[10px] text-muted-foreground/80">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/85">
                        {ev.summary}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <StatusBadge status="done" label="PathJail" />
        <Meta>2 policies active</Meta>
        <FileKey2 className="ml-auto size-3.5 text-muted-foreground/70" />
      </div>
    </div>
  );
}

// ─── Back-compat re-export types (old ActivityStep alias removed; prefer Timeline versions) ─────
export type {
  InspectorApprovalWait as ApprovalWait,
  InspectorCurrentStep as CurrentStep,
  InspectorData as ContextPanelData,
  InspectorDevActivityItem as DevActivityItem,
  InspectorMemoryItem as MemoryItem,
  InspectorToolItem as ToolItem,
  TimelineActivityStep,
  TimelineActivityStep as ActivityStep,
};
