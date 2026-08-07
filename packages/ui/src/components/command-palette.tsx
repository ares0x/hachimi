import {
  BarChart3,
  Brain,
  Code2,
  Download,
  FileSearch,
  MessageSquare,
  Moon,
  PenLine,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { type SearchResultItem, searchMessages } from "../api";
import type { Mode } from "../lib/agent-demo";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./command";

const ROLE_LABEL: Record<string, string> = {
  user: "你",
  assistant: "助手",
};

export function CommandPalette({
  open,
  onOpenChange,
  onSelectMode,
  onNewSession,
  onToggleTheme,
  onRunDemo,
  onExportBundle,
  onOpenSettings,
  onOpenTasks,
  onOpenUsage,
  onOpenApprovals,
  onOpenWork,
  theme,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectMode?: (m: Mode) => void;
  onNewSession: () => void;
  onToggleTheme: () => void;
  onRunDemo?: () => void;
  onExportBundle?: () => void;
  onOpenSettings?: () => void;
  /** L1: 后台任务面板入口（托盘 openTasks 等价动作） */
  onOpenTasks?: () => void;
  /** L1: 用量/费用面板入口 */
  onOpenUsage?: () => void;
  /** L1: 待审批面板入口（托盘 openApprovals 等价动作） */
  onOpenApprovals?: () => void;
  /** L1 (B12 lite): 搜索结果跳转到对应 Work（sessionId === workId） */
  onOpenWork?: (workId: string) => void;
  theme?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);

  // 打开时清空上次搜索状态
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // 防抖搜索（B12 lite）
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      setResults(await searchMessages(q, 20));
      setSearching(false);
    }, 260);
    return () => clearTimeout(timer);
  }, [query, open]);

  const run = (fn?: () => void) => () => {
    onOpenChange(false);
    if (fn) fn();
  };

  const openResult = (r: SearchResultItem) => {
    onOpenChange(false);
    if (onOpenWork) onOpenWork(r.workId ?? r.sessionId);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="输入意图或搜索历史会话…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>
          {searching ? "搜索中…" : query.trim().length >= 2 ? "没有匹配的结果" : "没有匹配的命令"}
        </CommandEmpty>

        {/* L1: 跨会话搜索（B12 lite） */}
        {results.length > 0 && (
          <CommandGroup heading="搜索结果">
            {results.slice(0, 8).map((r, i) => (
              <CommandItem
                key={`${r.type}_${r.sessionId}_${i}`}
                onSelect={() => openResult(r)}
                keywords={[query]}
              >
                {r.type === "work" ? (
                  <FileSearch className="mr-2" />
                ) : (
                  <MessageSquare className="mr-2" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.snippet}</span>
                  <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
                    {r.type === "work" ? "Work" : (ROLE_LABEL[r.role ?? ""] ?? r.role)}
                    {" · "}
                    {new Date(r.timestamp).toLocaleDateString()}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(onNewSession)}>
            <Plus className="mr-2 size-4" />
            New Work / Session
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          {onOpenTasks && (
            <CommandItem onSelect={run(onOpenTasks)}>
              <SquareTerminal className="mr-2 size-4" />
              后台任务
            </CommandItem>
          )}
          {onOpenUsage && (
            <CommandItem onSelect={run(onOpenUsage)}>
              <BarChart3 className="mr-2 size-4" />
              用量与费用
            </CommandItem>
          )}
          {onOpenApprovals && (
            <CommandItem onSelect={run(onOpenApprovals)}>
              <ShieldCheck className="mr-2 size-4" />
              待审批
            </CommandItem>
          )}
          {onOpenSettings && (
            <CommandItem onSelect={run(onOpenSettings)}>
              <Settings2 className="mr-2 size-4" />
              打开设置
              <CommandShortcut>⌘,</CommandShortcut>
            </CommandItem>
          )}
          {onExportBundle && (
            <CommandItem onSelect={run(onExportBundle)}>
              <Download className="mr-2 size-4" />
              导出 Bundle
            </CommandItem>
          )}
          <CommandItem onSelect={run(onRunDemo)}>
            <ShieldCheck className="mr-2 size-4" />
            运行演示任务（含授权请求）
            <CommandShortcut>⌘⏎</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(onToggleTheme)}>
            <Moon className="mr-2 size-4" />
            切换主题
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Modes">
          <CommandItem onSelect={run(() => onSelectMode?.("chat"))}>
            <MessageSquare className="mr-2 size-4" />
            对话模式
            <CommandShortcut>⌘1</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => onSelectMode?.("code"))}>
            <Code2 className="mr-2 size-4" />
            代码模式
            <CommandShortcut>⌘2</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => onSelectMode?.("research"))}>
            <Search className="mr-2 size-4" />
            研究模式
            <CommandShortcut>⌘3</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => onSelectMode?.("write"))}>
            <PenLine className="mr-2 size-4" />
            写作模式
            <CommandShortcut>⌘4</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Memory">
          <CommandItem>
            <Brain className="mr-2 size-4" />
            打开记忆浏览器
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
