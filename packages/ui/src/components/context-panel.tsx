import { Activity, Brain, ExternalLink, Gauge, Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ActivityStep, MemoryItem, Source } from "../lib/agent-demo";

export type { ActivityStep } from "../lib/agent-demo";

import { cn } from "../lib/utils";
import { Meta, SectionLabel, StatusBadge, StatusDot } from "./primitives";

type Tab = "activity" | "sources" | "memory";

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "activity", label: "Activity", icon: Activity },
  { id: "sources", label: "Sources", icon: Link2 },
  { id: "memory", label: "Memory", icon: Brain },
];

const KIND_TINT: Record<MemoryItem["kind"], string> = {
  preference: "text-primary",
  fact: "text-info",
  constraint: "text-danger",
  project: "text-mode-research",
};

export function ContextPanel({
  activity = [],
  sources = [],
  memories = [],
  tokens = 0,
  cost = "$0.00",
}: {
  activity: ActivityStep[];
  sources?: Source[];
  memories?: MemoryItem[];
  tokens: number;
  cost?: string;
}) {
  const [tab, setTab] = useState<Tab>("activity");

  return (
    <div className="flex h-full flex-col border-l border-border bg-surface">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors",
              tab === id
                ? "bg-surface-active text-foreground"
                : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "activity" && (
          <div>
            <SectionLabel className="px-0">Run trace</SectionLabel>
            <ol className="mt-2 space-y-0">
              {activity.map((step, i) => (
                <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < activity.length - 1 && (
                    <span className="absolute top-3 left-[3px] h-full w-px bg-border" aria-hidden />
                  )}
                  <span className="relative mt-1.5">
                    <StatusDot status={step.status} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-foreground">{step.label}</div>
                    <Meta>{step.meta}</Meta>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-4 rounded-lg border border-border/60 bg-surface-elevated p-3">
              <div className="flex items-center gap-2">
                <Gauge className="size-3.5 text-muted-foreground" />
                <SectionLabel className="px-0">Runtime & Sandbox</SectionLabel>
              </div>
              <dl className="mt-2 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-muted-foreground">
                  <dt>tokens</dt>
                  <dd className="text-foreground">{tokens.toLocaleString()} / 12k</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>est. cost</dt>
                  <dd className="text-foreground">{cost}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>storage</dt>
                  <dd className="text-emerald-600 dark:text-emerald-400">SQLite DB</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>sandbox</dt>
                  <dd className="text-emerald-600 dark:text-emerald-400">PathJail Enabled</dd>
                </div>
              </dl>
              <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, (tokens / 12000) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {tab === "sources" && (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.id}>
                <a
                  href={s.url}
                  className="block rounded-lg border border-border bg-surface-elevated p-3 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-px font-mono text-[11px] text-muted-foreground">
                      [{s.id}]
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-foreground">{s.title}</div>
                      <Meta>{s.domain}</Meta>
                    </div>
                    <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}

        {tab === "memory" && (
          <ul className="space-y-2">
            {memories.map((m) => (
              <li
                key={m.id}
                className="group rounded-lg border border-border bg-surface-elevated p-3 transition-colors hover:border-border-strong"
              >
                <div className="flex items-center gap-2">
                  <span className={cn("font-mono text-[11px]", KIND_TINT[m.kind])}>{m.kind}</span>
                  <Meta>· {m.when}</Meta>
                  <Meta className="ml-auto">{m.hits} hits</Meta>
                </div>
                <p className="mt-1.5 text-[13px] text-foreground">{m.text}</p>
                <button
                  type="button"
                  className="mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 font-mono text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-hover hover:text-danger focus-visible:opacity-100"
                >
                  <Trash2 className="size-3" />
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <StatusBadge status="done" label="PathJail" />
        <Meta>2 policies active</Meta>
      </div>
    </div>
  );
}
