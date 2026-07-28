import {
  Brain,
  Check,
  Code2,
  Command,
  MessageSquare,
  Package,
  PanelLeft,
  Pencil,
  PenLine,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
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
  onRenameSession,
  onDeleteSession,
  mode,
  onSelectMode,
  onNewSession,
  onOpenPalette,
  onExportBundle,
  onOpenSettings,
  running,
  memoryCount,
  collapsed = false,
  onToggleCollapse,
}: {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onRenameSession?: (id: string, title: string) => void;
  onDeleteSession?: (id: string) => void;
  mode: Mode;
  onSelectMode: (m: Mode) => void;
  onNewSession: () => void;
  onOpenPalette: () => void;
  onExportBundle?: () => void;
  onOpenSettings?: () => void;
  running: boolean;
  memoryCount: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartEdit = (e: React.MouseEvent, s: Session) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditTitle(s.title);
  };

  const handleSaveEdit = (e: React.MouseEvent | React.FormEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (editTitle.trim() && onRenameSession) {
      onRenameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (onDeleteSession) {
      onDeleteSession(id);
    }
  };

  if (collapsed) {
    return (
      <aside className="flex h-full w-full flex-col border-r border-border bg-surface">
        {/* Compact Top: Expand Toggle + New Session */}
        <div className="app-drag flex flex-col items-center gap-3 px-2 pt-9 pb-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="app-no-drag grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            title="展开侧边栏 (⌘B)"
            aria-label="展开侧边栏"
          >
            <PanelLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNewSession}
            className="app-no-drag grid size-8 place-items-center rounded-lg border border-border/60 bg-surface-elevated text-foreground shadow-xs transition-colors hover:bg-surface-hover hover:border-border-strong"
            title="新建会话"
            aria-label="新建会话"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Compact Session List (active dot + primary rail) */}
        <div className="scroll-quiet mt-2 flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto px-1.5 py-1">
          {sessions.map((s) => {
            const active = s.id === activeSessionId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSession(s.id)}
                className={cn(
                  "relative grid size-8 place-items-center rounded-lg transition-colors",
                  active
                    ? "bg-surface-active text-foreground"
                    : "text-muted-foreground hover:bg-surface-hover"
                )}
                title={`${s.title}${s.mode ? ` (${s.mode})` : ""}`}
                aria-label={s.title}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    active ? "bg-primary" : "bg-border-strong"
                  )}
                />
                {active && (
                  <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        {/* Compact Footer */}
        <div className="flex flex-col items-center gap-1 border-t border-border p-2">
          <button
            type="button"
            onClick={onOpenPalette}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            title="命令面板 (⌘K)"
            aria-label="命令面板"
          >
            <Command className="size-4" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            title="设置"
            aria-label="设置"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-surface">
      <div className="app-drag flex items-center justify-between px-3.5 pt-9 pb-3">
        <div className="flex items-center gap-2">
          <Mark size={22} />
          <span className="wordmark text-[15px] font-semibold text-foreground">Hachimi</span>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="app-no-drag grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            title="折叠侧边栏 (⌘B)"
            aria-label="折叠侧边栏"
          >
            <PanelLeft className="size-4" />
          </button>
        )}
      </div>

      <div className="px-3 mt-1">
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
                      ? "nav-rail bg-surface-active font-medium text-foreground"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                  )}
                >
                  <Icon className={cn("size-4", MODE_TINT[id])} />
                  <span className="flex-1 text-left">{MODE_LABEL[id]}</span>
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
            const isEditing = editingId === s.id;

            return (
              <li key={s.id}>
                {isEditing ? (
                  <form
                    onSubmit={(e) => handleSaveEdit(e, s.id)}
                    className="flex items-center gap-1 rounded-md border border-primary bg-surface p-1.5"
                  >
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full min-w-0 bg-transparent px-1 text-[13px] text-foreground focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={(e) => handleSaveEdit(e, s.id)}
                      className="grid size-6 shrink-0 place-items-center rounded text-primary hover:bg-surface-hover"
                    >
                      <Check className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-surface-hover"
                    >
                      <X className="size-3.5" />
                    </button>
                  </form>
                ) : (
                  <div
                    onClick={() => onSelectSession(s.id)}
                    className={cn(
                      "group relative flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-2 transition-colors",
                      active ? "nav-rail bg-surface-active" : "hover:bg-surface-hover"
                    )}
                  >
                    <div className="min-w-0 flex-1 pr-1.5">
                      <div
                        className={cn(
                          "truncate text-[13px]",
                          active
                            ? "font-medium text-foreground"
                            : "text-muted-foreground group-hover:text-foreground"
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
                    </div>

                    {/* Actions on hover */}
                    <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
                      <button
                        type="button"
                        onClick={(e) => handleStartEdit(e, s)}
                        className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                        title="重命名会话"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, s.id)}
                        className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-surface-hover hover:text-destructive"
                        title="删除会话"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}
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
          onClick={onOpenSettings}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Settings className="size-4" />
          <span className="flex-1 text-left">Settings</span>
        </button>
      </div>
    </aside>
  );
}
