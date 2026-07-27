import {
  type ActivityStep,
  exportBundle as apiExportBundle,
  CommandPalette,
  Composer,
  ContextPanel,
  createSession,
  deleteSession,
  fetchSession,
  fetchSessions,
  fetchStatus,
  type MessageData,
  MessageStream,
  type Mode,
  PermissionDock,
  renameSession,
  SessionHeader,
  type SessionItemData,
  Sidebar,
  sendSteerPrompt,
  streamChatPrompt,
  useTheme,
} from "@hachimi/ui";
import { useCallback, useEffect, useRef, useState } from "react";

export function App() {
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<Mode>("chat");
  const [sessions, setSessions] = useState<SessionItemData[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [activity, setActivity] = useState<ActivityStep[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState<any | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("hachimi_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [contextOpen, setContextOpen] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [memoryCount, setMemoryCount] = useState(0);
  const [currentSessionTitle, setCurrentSessionTitle] = useState("新会话");
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("hachimi_sidebar_collapsed", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Keyboard shortcut Cmd+B / Ctrl+B for sidebar collapse toggle (Design System §15)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebarCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebarCollapse]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, running]);

  // Load Status & Sessions from apps/server
  const refreshStatus = useCallback(async () => {
    const status = await fetchStatus();
    if (status) {
      if (status.context?.tokens) setTokens(status.context.tokens);
      if (status.memory?.totalCount != null) setMemoryCount(status.memory.totalCount);
    }
  }, []);

  const refreshSessions = useCallback(async (autoSelectLatest = false) => {
    const list = await fetchSessions();
    if (list) {
      const items = list.map((s) => ({
        id: s.id,
        title: s.title,
        updatedAt: s.updatedAt,
        mode: (s.mode as Mode) || "chat",
        runs: s.runs || 0,
      }));
      setSessions(items);

      if (autoSelectLatest && items.length > 0) {
        setActiveSessionId(items[0].id);
        setCurrentSessionTitle(items[0].title || items[0].id);
      }
    }
  }, []);

  const loadCurrentSessionMessages = useCallback(async (id: string) => {
    if (!id) return;
    const sess = await fetchSession(id);
    if (sess) {
      setCurrentSessionTitle(sess.title || sess.id);
      if (sess.messages && sess.messages.length > 0) {
        setMessages(
          sess.messages.map((m: any) => ({
            id: m.id || String(Math.random()),
            role: m.role,
            text: m.content || "",
            time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : undefined,
          }))
        );
      } else {
        setMessages([]);
      }
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshSessions(true);
  }, [refreshStatus, refreshSessions]);

  useEffect(() => {
    if (activeSessionId) {
      loadCurrentSessionMessages(activeSessionId);
    } else {
      setMessages([]);
      setCurrentSessionTitle("新会话");
    }
  }, [activeSessionId, loadCurrentSessionMessages]);

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setSidebarOpen(false);
  };

  const handleNewSession = () => {
    setActiveSessionId(null);
    setMessages([]);
    setCurrentSessionTitle("新会话");
  };

  const handleRenameSession = async (id: string, newTitle: string) => {
    await renameSession(id, newTitle);
    await refreshSessions();
    if (activeSessionId === id) {
      setCurrentSessionTitle(newTitle);
    }
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    const list = await fetchSessions();
    if (list) {
      const items = list.map((s) => ({
        id: s.id,
        title: s.title,
        updatedAt: s.updatedAt,
        mode: (s.mode as Mode) || "chat",
        runs: s.runs || 0,
      }));
      setSessions(items);

      if (activeSessionId === id) {
        if (items.length > 0) {
          setActiveSessionId(items[0].id);
          setCurrentSessionTitle(items[0].title || items[0].id);
        } else {
          setActiveSessionId(null);
          setMessages([]);
          setCurrentSessionTitle("新会话");
        }
      }
    }
  };

  const handleStartRun = async (promptText: string) => {
    if (!promptText.trim() || running) return;
    setRunning(true);
    setInput("");

    let sessionIdToUse = activeSessionId;

    // Lazy Session Allocation
    if (!sessionIdToUse) {
      const title = promptText.trim().slice(0, 18);
      const sess = await createSession(title);
      if (!sess) {
        setRunning(false);
        return;
      }
      sessionIdToUse = sess.id;
      setActiveSessionId(sess.id);
      setCurrentSessionTitle(sess.title || title);
      await refreshSessions();
    }

    const userMsgId = `u_${Date.now()}`;
    const assistantMsgId = `a_${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: promptText },
      { id: assistantMsgId, role: "assistant", text: "", streaming: true },
    ]);

    setActivity((prev) => [
      ...prev,
      {
        id: `act_${Date.now()}`,
        label: `User Turn: ${promptText.slice(0, 24)}...`,
        status: "done",
      },
      { id: `act_exec_${Date.now()}`, label: "Agent Tool Execution", status: "running" },
    ]);

    const targetSessionId = sessionIdToUse!;

    await streamChatPrompt(
      promptText,
      targetSessionId,
      (chunk) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, text: m.text + chunk } : m))
        );
      },
      (confirmInfo) => {
        setAwaitingApproval(confirmInfo);
      },
      (doneContent) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, text: m.text || doneContent, streaming: false } : m
          )
        );
        setRunning(false);
        refreshStatus();
        refreshSessions();
      },
      (err) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, text: `[Execution Error]: ${err}`, streaming: false }
              : m
          )
        );
        setRunning(false);
      }
    );
  };

  const handleSteer = async () => {
    if (!input.trim()) return;
    const steerText = input.trim();
    const ok = await sendSteerPrompt(steerText);
    setInput("");
    setMessages((prev) => [
      ...prev,
      {
        id: `steer_${Date.now()}`,
        role: "assistant",
        text: ok
          ? `[⚡ 插入纠偏]: 已成功注入指令 "${steerText}"`
          : "[⚡ 插入纠偏]: 当前 Agent 处于空闲状态，无运行中回合",
      },
    ]);
  };

  const handleExportBundle = async () => {
    const bundle = await apiExportBundle();
    if (bundle) {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hachimi_bundle_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Responsive Sidebar Backdrop */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
        />
      )}

      {/* Left Rail Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-[width,transform] duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          sidebarCollapsed ? "w-14" : "w-[264px]"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
          mode={mode}
          onSelectMode={setMode}
          onNewSession={handleNewSession}
          onOpenPalette={() => setPaletteOpen(true)}
          onExportBundle={handleExportBundle}
          running={running}
          memoryCount={memoryCount}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />
      </div>

      {/* Center Main Session Column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <SessionHeader
          title={currentSessionTitle}
          model="deepseek-v4-flash"
          running={running}
          theme={theme}
          onToggleTheme={toggle}
          contextOpen={contextOpen}
          onToggleContext={() => setContextOpen((o) => !o)}
          onToggleSidebar={toggleSidebarCollapse}
        />

        <div ref={scrollRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto flex w-full max-w-[52rem] flex-col justify-center px-4 py-16 sm:px-6">
              <h2 className="text-lg font-semibold text-foreground">今天需要我接手什么？</h2>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                我会先给出计划，再调用工具；任何写入或外发动作都会先问你。
              </p>
              <ul className="mt-5 space-y-2">
                {[
                  "请总结今日工作与活动要点",
                  "检查工作区里有哪些危险的文件权限配置",
                  "你还记得我有哪些喜好与偏好设置吗？",
                ].map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => handleStartRun(s)}
                      className="w-full rounded-lg border border-border bg-surface-elevated px-3.5 py-2.5 text-left text-[13px] text-foreground transition-colors hover:border-border-strong hover:bg-surface-hover"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <MessageStream
              messages={messages}
              onQuote={(q) => setInput(`> ${q.slice(0, 80)}...\n\n`)}
            />
          )}
        </div>

        {/* Permission Dock (HITL) */}
        {awaitingApproval && (
          <PermissionDock
            toolName={awaitingApproval.toolName}
            args={awaitingApproval.args}
            onApproveOnce={() => setAwaitingApproval(null)}
            onApproveSession={() => setAwaitingApproval(null)}
            onDeny={() => setAwaitingApproval(null)}
          />
        )}

        {/* Composer */}
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={() => handleStartRun(input.trim())}
          onSteer={handleSteer}
          onStop={() => setRunning(false)}
          running={running}
          mode={mode}
        />
      </div>

      {/* Right Inspector Context Panel */}
      {contextOpen && (
        <>
          <button
            type="button"
            aria-label="Close Inspector"
            onClick={() => setContextOpen(false)}
            className="fixed inset-0 z-30 bg-foreground/20 xl:hidden"
          />
          <div className="fixed inset-y-0 right-0 z-40 w-[300px] xl:static xl:z-auto xl:w-[320px]">
            <ContextPanel activity={activity} tokens={tokens} />
          </div>
        </>
      )}

      {/* Command Palette */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNewSession={handleNewSession}
        onExportBundle={handleExportBundle}
        onToggleTheme={toggle}
        theme={theme}
      />
    </div>
  );
}
