import { useState } from "react";
import { ChevronRight, Copy, Quote, BrainCircuit, Wrench, ListChecks } from "lucide-react";
import type { Message, PlanStep, ToolCall } from "../lib/agent-demo";
export type { Message as MessageData } from "../lib/agent-demo";
import { cn } from "../lib/utils";
import { Markdown } from "./markdown";
import { Mark, Meta, SandboxBadge, StatusBadge, StatusDot } from "./primitives";

function PlanBlock({ steps }: { steps: PlanStep[] }) {
  return (
    <div className="mb-3 rounded-lg border border-border bg-surface/70 p-3">
      <div className="flex items-center gap-2">
        <ListChecks className="size-3.5 text-muted-foreground" />
        <Meta>
          plan · {steps.filter((s) => s.status === "done").length}/{steps.length}
        </Meta>
      </div>
      <ol className="mt-2 space-y-1.5">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-[13px]">
            <span className="mt-1.5">
              <StatusDot status={s.status} />
            </span>
            <span className={cn(s.status === "done" ? "text-muted-foreground" : "text-foreground")}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ToolStrip({ tools }: { tools: ToolCall[] }) {
  const [open, setOpen] = useState(false);
  const running = tools.some((t) => t.status === "running");
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-border bg-surface/70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
      >
        <ChevronRight
          className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <Wrench className="size-3.5 text-muted-foreground" />
        <span className="flex-1 font-mono text-xs text-muted-foreground">
          {tools.length} tool calls
        </span>
        {running ? <StatusBadge status="running" /> : <StatusBadge status="done" />}
      </button>
      {open && (
        <ul className="border-t border-border">
          {tools.map((t) => (
            <li key={t.id} className="border-b border-border px-3 py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] text-foreground">{t.name}</span>
                <StatusBadge status={t.status} />
                {t.sandbox && <SandboxBadge />}
                {t.ms != null && t.status === "done" && <Meta>{t.ms}ms</Meta>}
              </div>
              <pre className="scroll-quiet mt-2 overflow-x-auto rounded-md border border-border bg-surface-elevated px-2.5 py-2 font-mono text-[12px] text-muted-foreground">
                <code>{t.args}</code>
              </pre>
              {t.status === "done" && t.result && (
                <div className="mt-1.5 font-mono text-[12px] text-muted-foreground">
                  → {t.result}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HoverActions() {
  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {[
        { icon: Copy, label: "Copy" },
        { icon: Quote, label: "Quote" },
        { icon: BrainCircuit, label: "Remember" },
      ].map(({ icon: Icon, label }) => (
        <button
          key={label}
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Icon className="size-3" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function MessageStream({
  messages,
  onQuote,
}: {
  messages: Message[];
  onQuote?: (q: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-7 px-4 py-6 sm:px-6">
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="enter-rise flex justify-end">
            <div className="max-w-[75%] rounded-lg border border-border bg-surface-elevated px-3.5 py-2.5 text-[14px] text-foreground">
              {m.text}
            </div>
          </div>
        ) : (
          <article key={m.id} className="enter-rise group">
            <div className="mb-2 flex items-center gap-2">
              <Mark size={18} />
              <span className="text-[13px] font-medium text-foreground">Hachimi</span>
              <Meta>{m.time}</Meta>
            </div>
            {m.plan && <PlanBlock steps={m.plan} />}
            {m.tools && m.tools.length > 0 && <ToolStrip tools={m.tools} />}
            {m.text ? (
              <Markdown text={m.text} />
            ) : (
              <div className="pulse-status font-mono text-[13px] text-muted-foreground">
                Thinking…
              </div>
            )}
            {m.streaming && (
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-primary pulse-status" />
            )}
            {!m.streaming && m.text && <HoverActions />}
          </article>
        )
      )}
    </div>
  );
}
