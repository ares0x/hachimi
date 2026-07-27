import {
  type ActivityStep,
  exportBundle as apiExportBundle,
  approveTool,
  CommandPalette,
  Composer,
  ContextPanel,
  createWork,
  deleteSession,
  deleteWork,
  fetchSession,
  fetchStatus,
  fetchWork,
  fetchWorks,
  type MessageData,
  MessageStream,
  PermissionDock,
  SessionHeader,
  sendSteerPrompt,
  streamChatPrompt,
  updateWork,
  useTheme,
  WelcomeView,
  type WorkItem,
  WorkList,
} from "@hachimi/ui";
import { useCallback, useEffect, useRef, useState } from "react";

const INTENT_CHIPS = [
  "分析当前项目的目录结构与架构设计",
  "总结今日已完成的工作要点",
  "检查工作区是否存在危险文件配置",
  "列出我当前已记录的喜好与偏好设置",
];

export function App() {
  const { theme, toggle } = useTheme();
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null);
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

  // Keyboard shortcut Cmd+B / Ctrl+B for sidebar toggle
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

  const [contextOpen, setContextOpen] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [currentWorkTitle, setCurrentWorkTitle] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, running]);

  // Load Status & Works
  const refreshStatus = useCallback(async () => {
    const status = await fetchStatus();
    if (status && status.context?.tokens) {
      setTokens(status.context.tokens);
    }
  }, []);

  const refreshWorksList = useCallback(
    async (autoSelectLatest = false) => {
      const list = await fetchWorks("primary");
      setWorks(list);
      if (autoSelectLatest && list.length > 0 && !activeWorkId) {
        // 首次加载时不强制选第一个，保持独立空白页，除非用户操作
      }
    },
    [activeWorkId]
  );

  const loadWorkDetails = useCallback(async (id: string) => {
    const work = await fetchWork(id);
    if (work) {
      setCurrentWorkTitle(work.title);
      // 加载关联 Session 的消息流
      const sess = await fetchSession(id);
      if (sess && sess.messages) {
        setMessages(
          sess.messages.map((m: any) => ({
            id: m.id || String(Math.random()),
            role: m.role,
            text: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
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
    refreshWorksList(true);
  }, [refreshStatus, refreshWorksList]);

  useEffect(() => {
    if (activeWorkId) {
      loadWorkDetails(activeWorkId);
    } else {
      setMessages([]);
      setCurrentWorkTitle("");
    }
  }, [activeWorkId, loadWorkDetails]);

  const handleSelectWork = (id: string) => {
    setActiveWorkId(id);
    setSidebarOpen(false);
  };

  const handleNewWork = () => {
    setActiveWorkId(null);
    setMessages([]);
    setCurrentWorkTitle("");
  };

  const handleRenameWork = async (id: string, newTitle: string) => {
    await updateWork(id, { title: newTitle });
    await refreshWorksList();
    if (activeWorkId === id) {
      setCurrentWorkTitle(newTitle);
    }
  };

  const handleDeleteWork = async (id: string) => {
    await deleteWork(id);
    await deleteSession(id);
    const list = await fetchWorks("primary");
    setWorks(list);
    if (activeWorkId === id) {
      setActiveWorkId(null);
      setMessages([]);
      setCurrentWorkTitle("");
    }
  };

  const handleStartWork = async (intentText: string) => {
    if (!intentText.trim() || running) return;
    setRunning(true);
    setInput("");

    let workIdToUse = activeWorkId;

    // 若尚未在某个 Work 中，发起新 Work
    if (!workIdToUse) {
      const newWork = await createWork(intentText.trim());
      if (newWork) {
        workIdToUse = newWork.id;
        setActiveWorkId(newWork.id);
        setCurrentWorkTitle(newWork.title);
        await refreshWorksList();
      }
    }

    const userMsgId = `u_${Date.now()}`;
    const assistantMsgId = `a_${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: intentText },
      { id: assistantMsgId, role: "assistant", text: "", streaming: true },
    ]);

    setActivity((prev) => [
      ...prev,
      {
        id: `act_${Date.now()}`,
        label: `Work Turn: ${intentText.slice(0, 24)}...`,
        status: "done",
      },
      { id: `act_exec_${Date.now()}`, label: "Agent Tool Execution", status: "running" },
    ]);

    const targetWorkId = workIdToUse || String(Date.now());

    await streamChatPrompt(
      intentText,
      targetWorkId,
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
            m.id === assistantMsgId
              ? {
                  ...m,
                  text: m.text
                    ? doneContent && !m.text.includes(doneContent)
                      ? `${m.text}\n\n${doneContent}`
                      : m.text
                    : doneContent,
                  streaming: false,
                }
              : m
          )
        );
        setRunning(false);
        refreshStatus();
        refreshWorksList();
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

      {/* Left Work List Rail */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-[width,transform] duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          sidebarCollapsed ? "w-14" : "w-[264px]"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <WorkList
          works={works}
          activeWorkId={activeWorkId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onSelectWork={handleSelectWork}
          onRenameWork={handleRenameWork}
          onDeleteWork={handleDeleteWork}
          onNewWork={handleNewWork}
          onOpenPalette={() => setPaletteOpen(true)}
          onExportBundle={handleExportBundle}
        />
      </div>

      {/* Center Main Work View */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {!activeWorkId && messages.length === 0 ? (
          <WelcomeView
            model="deepseek-v4-flash"
            theme={theme}
            onToggleTheme={toggle}
            contextOpen={contextOpen}
            onToggleContext={() => setContextOpen((o) => !o)}
            onToggleSidebar={toggleSidebarCollapse}
            onSelectPrompt={(prompt) => handleStartWork(prompt)}
          />
        ) : (
          <>
            <SessionHeader
              title={currentWorkTitle || "工作空间"}
              model="deepseek-v4-flash"
              running={running}
              theme={theme}
              onToggleTheme={toggle}
              contextOpen={contextOpen}
              onToggleContext={() => setContextOpen((o) => !o)}
              onToggleSidebar={toggleSidebarCollapse}
            />

            <div ref={scrollRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
              <MessageStream
                messages={messages}
                onQuote={(q) => setInput(`> ${q.slice(0, 80)}...\n\n`)}
              />
            </div>
          </>
        )}

        {/* Permission Dock (HITL) */}
        {awaitingApproval && (
          <PermissionDock
            toolName={awaitingApproval.toolName}
            args={awaitingApproval.args}
            onApproveOnce={async () => {
              if (awaitingApproval.approvalId) {
                await approveTool(awaitingApproval.approvalId, "approve");
              }
              setAwaitingApproval(null);
            }}
            onApproveSession={async () => {
              if (awaitingApproval.approvalId) {
                await approveTool(awaitingApproval.approvalId, "approve");
              }
              setAwaitingApproval(null);
            }}
            onDeny={async () => {
              if (awaitingApproval.approvalId) {
                await approveTool(awaitingApproval.approvalId, "deny");
              }
              setAwaitingApproval(null);
            }}
          />
        )}

        {/* Composer with Work Context */}
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={() => handleStartWork(input.trim())}
          onSteer={handleSteer}
          onStop={() => setRunning(false)}
          running={running}
          mode="chat"
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
        onNewSession={handleNewWork}
        onExportBundle={handleExportBundle}
        onToggleTheme={toggle}
        theme={theme}
      />
    </div>
  );
}
