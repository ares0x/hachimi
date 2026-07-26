import {
  Code2,
  Command,
  MessageSquare,
  PenLine,
  Plus,
  Search,
  Settings,
  Brain,
  Package,
} from "lucide-react";
import { MODE_LABEL, type Mode, type Session } from "../lib/agent-demo";
import { cn, formatRelativeTime } from "../lib/utils";
import { Mark, SectionLabel, StatusDot } from "./primitives";

export type { Mode, Session as SessionItemData } from "../lib/agent-demo";

const MODES: { id: Mode; icon: typeof Code2; hint: string }[] = [
  { id: "chat", icon: MessageSquare, hint: "⌘1" },
  { id: "code", icon: Code2, hint: "⌘2" },
  { id: "research", icon: Search, hint: "⌘3" },
  { id: "write", icon: PenLine, hint: "⌘4" },
];

const MODE_TINT: Record<Mode, string> = {
  chat: "text-primary",
  code: "text-mode-code",
  research: "text-mode-research",
  write: "text-mode-write",
};

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  mode,
  onSelectMode,
  onNewSession,
  onOpenPalette,
  onExportBundle,
  running,
  memoryCount,
}: {
  sessions: Session[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  mode: Mode;
  onSelectMode: (m: Mode) => void;
  onNewSession: () => void;
  onOpenPalette: () => void;
  onExportBundle?: () => void;
  running: boolean;
  memoryCount: number;
}) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <Mark size={24} />
        <span className="wordmark text-[15px] font-semibold text-foreground">Hachimi</span>
      </div>

      {/* Compact assistant status — not a character stage */}
      <div className="mx-3 mb-3 rounded-md border border-border bg-surface-elevated px-3 py-2">
        <div className="flex items-center gap-2">
          <StatusDot status={running ? "running" : "done"} />
          <span className="font-mono text-xs text-muted-foreground">
            {running ? "running" : "ready"} · {memoryCount} memories
          </span>
        </div>
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
          single brain · 3 tools · PathJail on
        </div>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNewSession}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" />
          New session
        </button>
      </div>

      <nav className="mt-4 px-3">
        <SectionLabel>Modes</SectionLabel>
        <ul className="mt-1.5 space-y-0.5">
          {MODES.map(({ id, icon: Icon, hint }) => {
            const active = mode === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelectMode(id)}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
                    active
                      ? "nav-rail bg-surface-active text-foreground"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                  )}
                >
                  <Icon className={cn("size-4", active ? MODE_TINT[id] : "")} />
                  <span className="min-w-0 flex-1 truncate text-left">{MODE_LABEL[id]}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
        <SectionLabel>Sessions</SectionLabel>
        <ul className="scroll-quiet mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
          {sessions.map((s) => {
            const active = s.id === activeSessionId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelectSession(s.id)}
                  className={cn(
                    "w-full rounded-md px-2 py-2 text-left transition-colors",
                    active ? "nav-rail bg-surface-active" : "hover:bg-surface-hover"
                  )}
                >
                  <div
                    className={cn(
                      "truncate text-[13px]",
                      active ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {s.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                    <span className={MODE_TINT[s.mode || "chat"]}>{s.mode || "chat"}</span>
                    <span>·</span>
                    <span>{s.runs || 0} runs</span>
                    <span>·</span>
                    <span>{s.time || formatRelativeTime(s.updatedAt || 0)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Command className="size-4" />
          <span className="flex-1 text-left">Command palette</span>
          <span className="font-mono text-[11px]">⌘K</span>
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Brain className="size-4" />
          <span className="flex-1 text-left">Memory browser</span>
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Package className="size-4" />
          <span className="flex-1 text-left">Portable bundle</span>
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Settings className="size-4" />
          <span className="flex-1 text-left">Settings</span>
        </button>
      </div>
    </aside>
  );
}
