import { AnimatePresence, motion } from "motion/react";
import {
  ActivityTimeline,
  exportBundle as apiExportBundle,
  importBundle as apiImportBundle,
  approveTool,
  CommandPalette,
  Composer,
  ContextPanel,
  type ContextPanelData,
  cancelWork,
  createWork,
  deleteSession,
  deleteWork,
  fetchDaemonConfig,
  fetchSession,
  fetchStatus,
  fetchWork,
  fetchWorkActivities,
  fetchWorkEvents,
  fetchWorks,
  GoalPanel,
  getApiSecret,
  PermissionDock,
  PlanTracker,
  type PlanStep as PlanTrackerStep,
  SessionHeader,
  type ModelOption as SettingsModelOption,
  SettingsPanel,
  sendSteerPrompt,
  setApiSecret,
  streamChatPrompt,
  type ThemeTone,
  type ActivityStep as TimelineActivityStep,
  updateDaemonConfig,
  updateWork,
  updateWorkGoal,
  updateWorkPlan,
  useTheme,
  WelcomeView,
  type WorkItem,
  WorkList,
} from "@hachimi/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const INTENT_CHIPS = [
  "分析当前项目的目录结构与架构设计",
  "总结今日已完成的工作要点",
  "检查工作区是否存在危险文件配置",
  "列出我当前已记录的喜好与偏好设置",
];

// Fallback model options when daemon config is unavailable
const FALLBACK_MODEL_OPTIONS: SettingsModelOption[] = [
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    description: "快速日常推理，默认推荐",
    speed: "fast",
  },
  {
    id: "deepseek-v4",
    name: "DeepSeek V4",
    description: "更长上下文，更深度思考",
    speed: "balanced",
  },
  {
    id: "gpt-codex",
    name: "Codex / GPT-4o",
    description: "代码生成与综合任务",
    speed: "thorough",
  },
];

const DEFAULT_MODEL = "deepseek-v4-flash";

type PlanStepRaw = PlanTrackerStep & { description?: string };

interface LoadedWorkDetail {
  id: string;
  title: string;
  uiKind?: "conversation" | "task" | "project";
  workspaceRoot?: string;
  goal?: string;
  status: WorkItem["status"];
  plan: PlanStepRaw[];
  /** /works/:id/activities 返回的投影 */
  timeline: TimelineActivityStep[];
  /** /works/:id/events 的原始事件流 */
  rawEvents?: { id: string; type: string; timestamp: string; summary: string; payload?: any }[];
  tokens?: number;
  maxTokens?: number;
  requestId?: string;
  /** 最近的等待审批信息（从 pending approvals 投影或最后一条 approval_requested） */
  awaitingApproval?: {
    approvalId: string;
    toolName: string;
    summary: string;
    sinceIso: string;
  };
}

function buildModelOptions(cfg: {
  activeProvider: string;
  providers: Array<{ id: string; model: string; hasKey: boolean; baseURL?: string }>;
}): SettingsModelOption[] {
  return cfg.providers.map((p) => ({
    id: p.model,
    name: `${p.id} · ${p.model}`,
    description: p.hasKey ? undefined : "未配置 API Key",
    speed: p.id === "mock" ? "fast" : undefined,
    providerId: p.id,
  }));
}

function secretPreview(s: string): string {
  if (!s) return "";
  if (s.length <= 8) return `${"•".repeat(s.length)}`;
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

export function App() {
  const { theme, setTheme, toggle } = useTheme();
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null);
  const [workDetail, setWorkDetail] = useState<LoadedWorkDetail | null>(null);
  const [draftWorkspaceRoot, setDraftWorkspaceRoot] = useState<string | null>(null);
  const [daemonStatus, setDaemonStatus] = useState<any>(null);

  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [approvalQueue, setApprovalQueue] = useState<{
    approvalId?: string;
    toolName: string;
    args: Record<string, unknown>;
    argsSummary?: any;
  } | null>(null);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("hachimi_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [sidebarWidth, setSidebarWidth] = useState(264);
  const [inspectorWidth, setInspectorWidth] = useState(340);
  const isDraggingSidebar = useRef(false);
  const isDraggingInspector = useRef(false);
  const lastSidebarX = useRef(264);
  const lastSidebarTime = useRef(Date.now());
  const sidebarVelocity = useRef(0);
  const lastInspectorX = useRef(340);
  const lastInspectorTime = useRef(Date.now());
  const inspectorVelocity = useRef(0);

  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Apple Design §6 Momentum Projection function
  const projectMomentum = (initialVelocity: number, decelerationRate = 0.998) => {
    return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate);
  };

  const handleSidebarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingSidebar.current = true;
    lastSidebarX.current = e.clientX;
    lastSidebarTime.current = Date.now();
    sidebarVelocity.current = 0;
  };

  const handleSidebarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSidebar.current) return;
    const now = Date.now();
    const dt = now - lastSidebarTime.current;
    if (dt > 0) {
      sidebarVelocity.current = (e.clientX - lastSidebarX.current) / (dt / 1000);
    }
    lastSidebarX.current = e.clientX;
    lastSidebarTime.current = now;

    const newW = Math.max(180, Math.min(420, e.clientX));
    setSidebarWidth(newW);
  };

  const handleSidebarPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSidebar.current) return;
    isDraggingSidebar.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const projectedW = sidebarWidth + projectMomentum(sidebarVelocity.current);
    if (projectedW < 140) {
      setSidebarCollapsed(true);
      setSidebarWidth(264);
    } else {
      setSidebarCollapsed(false);
      setSidebarWidth(Math.max(200, Math.min(400, Math.round(projectedW / 20) * 20)));
    }
  };

  const handleInspectorPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingInspector.current = true;
    lastInspectorX.current = e.clientX;
    lastInspectorTime.current = Date.now();
    inspectorVelocity.current = 0;
  };

  const handleInspectorPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingInspector.current) return;
    const now = Date.now();
    const dt = now - lastInspectorTime.current;
    if (dt > 0) {
      inspectorVelocity.current = (e.clientX - lastInspectorX.current) / (dt / 1000);
    }
    lastInspectorX.current = e.clientX;
    lastInspectorTime.current = now;

    const newW = Math.max(260, Math.min(520, window.innerWidth - e.clientX));
    setInspectorWidth(newW);
  };

  const handleInspectorPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingInspector.current) return;
    isDraggingInspector.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const projectedW = inspectorWidth - projectMomentum(inspectorVelocity.current);
    if (projectedW < 200) {
      setInspectorOpen(false);
      setInspectorWidth(340);
    } else {
      setInspectorWidth(Math.max(280, Math.min(480, Math.round(projectedW / 20) * 20)));
    }
  };

  // Settings-managed state — synced with daemon config
  const [modelOptions, setModelOptions] = useState<SettingsModelOption[]>(FALLBACK_MODEL_OPTIONS);
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    try {
      return localStorage.getItem("hachimi_model") || DEFAULT_MODEL;
    } catch {
      return DEFAULT_MODEL;
    }
  });
  // Sync model selection to daemon config on change
  const handleModelChange = useCallback(
    async (id: string) => {
      setSelectedModelId(id);
      try {
        localStorage.setItem("hachimi_model", id);
      } catch {
        /* ignore */
      }
      // Persist to daemon config
      const result = await updateDaemonConfig({ model: id });
      if (result) {
        // Update active provider if the model belongs to a different provider
        const provider = modelOptions.find((m) => m.id === id);
        if (provider && provider.providerId && provider.providerId !== result.activeProvider) {
          const switchResult = await updateDaemonConfig({
            activeProvider: provider.providerId,
            model: id,
          });
          if (switchResult) {
            // Refresh model list from daemon to reflect the switch
            const cfg = await fetchDaemonConfig();
            if (cfg) {
              setModelOptions(buildModelOptions(cfg));
            }
          }
        }
      }
    },
    [modelOptions]
  );

  const [accentHex, setAccentHex] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem("hachimi_accent") || undefined;
    } catch {
      return undefined;
    }
  });
  useEffect(() => {
    if (!accentHex) return;
    try {
      localStorage.setItem("hachimi_accent", accentHex);
      const root = document.documentElement;
      if (root) root.style.setProperty("--primary", accentHex);
    } catch {
      /* ignore */
    }
  }, [accentHex]);

  const [secretConfigured, setSecretConfigured] = useState<boolean>(Boolean(getApiSecret()));
  const [bundleBusy, setBundleBusy] = useState(false);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebarCollapse();
      }
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key.toLowerCase() === "," && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSettingsOpen(true);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebarCollapse]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [workDetail?.timeline, running]);

  // ─── Loaders ─────────────────────────────────────────────────────────────

  const refreshWorksList = useCallback(async () => {
    const list = await fetchWorks("primary");
    setWorks(list);
  }, []);

  const refreshWorkDetail = useCallback(async (workId: string) => {
    const [work, activities, events, sess, status] = await Promise.all([
      fetchWork(workId),
      fetchWorkActivities(workId),
      fetchWorkEvents(workId, { limit: 50 }),
      fetchSession(workId),
      fetchStatus(),
    ]);

    if (status) {
      setDaemonStatus(status);
    }

    const plan: PlanStepRaw[] = Array.isArray(work?.plan)
      ? work.plan.map((p: any, i: number) => ({
          id: String(p.id ?? `s_${i}`),
          title: p.title ?? `Step ${i + 1}`,
          description: p.description ?? undefined,
          status: (p.status as PlanStepRaw["status"]) ?? "pending",
          completedAt: p.completedAt ?? undefined,
        }))
      : [];

    const rawEvents = events.map((e: any, i: number) => ({
      id: String(e.id ?? `e_${i}`),
      type: String(e.type ?? "unknown"),
      timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : new Date().toISOString(),
      summary:
        e.summary ||
        (typeof e.payload?.summary === "string" ? e.payload.summary : undefined) ||
        describeEvent(e) ||
        e.type ||
        "",
      payload: e.payload,
    }));

    const pendingApproval = findLastItem(rawEvents, (e: any) => e.type === "approval_requested");
    const granted = findLastItem(rawEvents, (e: any) => e.type === "approval_granted");
    const denied = findLastItem(rawEvents, (e: any) => e.type === "approval_denied");
    const awaiting: LoadedWorkDetail["awaitingApproval"] =
      pendingApproval &&
      (!granted || new Date(granted.timestamp) < new Date(pendingApproval.timestamp)) &&
      (!denied || new Date(denied.timestamp) < new Date(pendingApproval.timestamp))
        ? {
            approvalId: String(pendingApproval.payload?.approvalId ?? pendingApproval.id),
            toolName: String(pendingApproval.payload?.toolName ?? "tool"),
            summary:
              pendingApproval.summary ||
              String(pendingApproval.payload?.summary ?? "等待您的批准决定"),
            sinceIso: pendingApproval.timestamp,
          }
        : undefined;

    setWorkDetail((prev) => {
      let timeline = (activities || []) as TimelineActivityStep[];
      if (prev?.id === workId) {
        // 1. Preserve optimistic user prompt (pending_...) if server activities don't have it yet
        const pendingUserMsgs = prev.timeline.filter((t) => t.id.startsWith("pending_"));
        for (const userMsg of pendingUserMsgs) {
          const userTime = new Date(userMsg.timestamp).getTime();
          const hasServerUserMsg = timeline.some(
            (t) => t.role === "user" && new Date(t.timestamp).getTime() >= userTime - 2000
          );
          if (!hasServerUserMsg) {
            timeline.push(userMsg);
          }
        }

        // 2. Preserve optimistic streaming assistant response (assistant_streaming_...)
        const streamingAssistantMsg = prev.timeline.find((t) =>
          t.id.startsWith("assistant_streaming_")
        );
        if (streamingAssistantMsg) {
          const streamingTime = new Date(streamingAssistantMsg.timestamp).getTime();
          const hasServerAssistantMsg = timeline.some(
            (t) => t.role === "assistant" && new Date(t.timestamp).getTime() >= streamingTime - 2000
          );
          if (!hasServerAssistantMsg) {
            timeline.push(streamingAssistantMsg);
          }
        }
      }

      timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      return {
        id: workId,
        title: work?.title ?? sess?.title ?? `Work ${workId.slice(0, 8)}`,
        uiKind: work?.uiKind,
        workspaceRoot: work?.workspaceRoot,
        goal: typeof work?.goal === "string" ? work.goal : undefined,
        status: work?.status ?? "active",
        plan,
        timeline,
        rawEvents,
        tokens: status?.context?.tokens ?? work?.tokens ?? 0,
        maxTokens: status?.context?.maxTokens ?? 12000,
        requestId: sess?.requestId ?? work?.requestId ?? undefined,
        awaitingApproval: awaiting,
      };
    });
  }, []);

  useEffect(() => {
    // 启动时一次性：Works 列表、Secret 状态、Daemon config 同步
    (async () => {
      await refreshWorksList();
      setSecretConfigured(Boolean(getApiSecret()));
      // Fetch daemon config and sync model selection
      const cfg = await fetchDaemonConfig();
      if (cfg) {
        setModelOptions(buildModelOptions(cfg));
        const activeProvider = cfg.providers.find((p) => p.id === cfg.activeProvider);
        if (activeProvider) {
          setSelectedModelId(activeProvider.model);
          try {
            localStorage.setItem("hachimi_model", activeProvider.model);
          } catch {
            /* ignore */
          }
        }
      }
    })();
  }, [refreshWorksList]);

  useEffect(() => {
    if (!activeWorkId) {
      setWorkDetail(null);
      return;
    }
    refreshWorkDetail(activeWorkId);
  }, [activeWorkId, refreshWorkDetail]);

  // ─── Event handlers ──────────────────────────────────────────────────────

  const handleSelectWork = (id: string) => {
    setActiveWorkId(id);
    setSidebarOpen(false);
  };

  const handleNewWork = () => {
    setActiveWorkId(null);
    setWorkDetail(null);
  };

  const handleSetWorkspaceRoot = async (newPath: string | null) => {
    const cleanPath = newPath?.trim() || undefined;
    if (activeWorkId) {
      setWorkDetail((prev) =>
        prev
          ? {
              ...prev,
              workspaceRoot: cleanPath,
              uiKind: cleanPath ? "project" : prev.uiKind,
            }
          : prev
      );
      await updateWork(activeWorkId, {
        workspaceRoot: cleanPath || "",
        uiKind: cleanPath ? "project" : "conversation",
      });
      await refreshWorksList();
    } else {
      setDraftWorkspaceRoot(cleanPath || null);
    }
  };

  const handleRenameWork = async (id: string, newTitle: string) => {
    await updateWork(id, { title: newTitle });
    await refreshWorksList();
    if (workDetail?.id === id) {
      setWorkDetail((prev) => (prev ? { ...prev, title: newTitle } : prev));
    }
  };

  const handleDeleteWork = async (id: string) => {
    await deleteWork(id);
    await deleteSession(id);
    await refreshWorksList();
    if (activeWorkId === id) {
      setActiveWorkId(null);
      setWorkDetail(null);
    }
  };

  const handleCancelWork = async () => {
    if (!activeWorkId || !workDetail) return;
    const ok = await cancelWork(activeWorkId);
    if (ok) {
      await refreshWorksList();
      await refreshWorkDetail(activeWorkId);
    }
  };

  const handleSaveGoal = async (newGoal: string) => {
    if (!activeWorkId) return;
    const next = (newGoal || "").trim();
    const updated = await updateWorkGoal(activeWorkId, next);
    if (updated) {
      setWorkDetail((prev) => (prev ? { ...prev, goal: next || undefined } : prev));
      await refreshWorksList();
    }
  };

  const handlePlanChange = async (steps: PlanStepRaw[]) => {
    if (!activeWorkId) return;
    const updated = await updateWorkPlan(activeWorkId, steps);
    if (updated) {
      setWorkDetail((prev) => (prev ? { ...prev, plan: steps } : prev));
      await refreshWorksList();
    }
  };

  const handleStartWork = async (intentText: string) => {
    if (!intentText.trim() || running) return;
    setRunning(true);
    setInput("");

    let workIdToUse = activeWorkId;
    if (!workIdToUse) {
      const newWork = await createWork(intentText.trim(), {
        uiKind: draftWorkspaceRoot ? "project" : "conversation",
        workspaceRoot: draftWorkspaceRoot || undefined,
      });
      if (newWork) {
        workIdToUse = newWork.id;
        setActiveWorkId(newWork.id);
      }
      setDraftWorkspaceRoot(null);
    }

    await refreshWorksList();
    if (workIdToUse) await refreshWorkDetail(workIdToUse);

    const targetWorkId = workIdToUse || String(Date.now());

    // Optimistically show user's message in the timeline immediately
    const optimisticUserMsg = {
      id: `pending_${Date.now()}`,
      type: "message" as const,
      role: "user" as const,
      timestamp: new Date().toISOString(),
      content: intentText.trim(),
    };
    setWorkDetail((prev) =>
      prev ? { ...prev, timeline: [...prev.timeline, optimisticUserMsg] } : prev
    );

    const assistantMsgId = `assistant_streaming_${Date.now()}`;
    await streamChatPrompt(
      intentText,
      targetWorkId,
      (chunk: string) => {
        setWorkDetail((prev) => {
          if (!prev) return prev;
          const timeline = [...prev.timeline];
          const lastIdx = timeline.findIndex((t) => t.id === assistantMsgId);
          if (lastIdx >= 0) {
            timeline[lastIdx] = {
              ...timeline[lastIdx],
              content: timeline[lastIdx].content + chunk,
            };
          } else {
            timeline.push({
              id: assistantMsgId,
              type: "message",
              role: "assistant",
              timestamp: new Date().toISOString(),
              content: chunk,
            });
          }
          return { ...prev, timeline };
        });
      },
      (confirmInfo) => {
        setApprovalQueue(confirmInfo);
        setRunning(false);
      },
      async () => {
        // 完成后刷新：works 列表进度 + 详情 timeline/plan
        await refreshWorksList();
        if (targetWorkId) await refreshWorkDetail(targetWorkId);
        setRunning(false);
      },
      async (err) => {
        console.error("streamChat error:", err);
        await refreshWorksList();
        if (targetWorkId) await refreshWorkDetail(targetWorkId);
        setRunning(false);
      }
    );
  };

  const handleSteer = async () => {
    if (!input.trim()) return;
    const steerText = input.trim();
    setInput("");
    const ok = await sendSteerPrompt(steerText);
    if (ok && activeWorkId) {
      // 等待一小段后拉取活动流，让 steer 事件落盘
      setTimeout(() => refreshWorkDetail(activeWorkId), 300);
    }
    // 给用户即时反馈：在 timeline 末尾临时插入一个 steer 视觉块（保持空数组以不影响真实投影）
    if (!ok) {
      console.warn("[steer] no active session or agent idle");
    }
  };

  // ─── Bundle ──────────────────────────────────────────────────────────────

  const handleExportBundle = async () => {
    setBundleBusy(true);
    try {
      const bundle = await apiExportBundle();
      if (bundle) {
        const blob = new Blob([JSON.stringify(bundle, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `hachimi_bundle_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setBundleBusy(false);
    }
  };

  const handleImportBundle = async (file: File) => {
    setBundleBusy(true);
    try {
      const res = await apiImportBundle(file);
      if (res) {
        await refreshWorksList();
        if (activeWorkId) await refreshWorkDetail(activeWorkId);
      }
    } finally {
      setBundleBusy(false);
    }
  };

  // ─── Approval decision ──────────────────────────────────────────────────

  const resolveApproval = useCallback(
    async (decision: "approve" | "deny") => {
      if (!approvalQueue?.approvalId) {
        setApprovalQueue(null);
        return;
      }
      const ok = await approveTool(approvalQueue.approvalId, decision);
      if (ok) {
        setApprovalQueue(null);
        setRunning(true); // 重新进入运行
        // 恢复等待期间暂停的流：我们无法继续 fetch stream 所以直接让 UI 提示 + 3s 后刷新
        setTimeout(async () => {
          if (activeWorkId) await refreshWorkDetail(activeWorkId);
          await refreshWorksList();
          setRunning(false);
        }, 2500);
      }
    },
    [approvalQueue, activeWorkId, refreshWorkDetail, refreshWorksList]
  );

  // ─── Derived data for Inspector ─────────────────────────────────────────

  const inspectorData: ContextPanelData = useMemo(() => {
    const currentPlanStep = workDetail?.plan
      ? (workDetail.plan.find((p) => p.status === "running" || p.status === "pending") ??
        workDetail.plan[workDetail.plan.length - 1])
      : undefined;

    const memories = workDetail?.timeline ? extractMemoryFromTimeline(workDetail.timeline) : [];
    const rawTools = daemonStatus?.tools || inferActiveToolsFromWork(workDetail);
    const tools = Array.isArray(rawTools)
      ? rawTools.map((t: any) => ({
          name: typeof t === "string" ? t : t.name || "tool",
          permission: (typeof t === "object" && t.permission) || "safe",
          description: (typeof t === "object" && t.description) || "",
        }))
      : [];

    return {
      currentStep: currentPlanStep
        ? {
            id: currentPlanStep.id,
            title: currentPlanStep.title,
            status: currentPlanStep.status,
            description: currentPlanStep.description,
          }
        : undefined,
      memories: daemonStatus?.memories?.length ? daemonStatus.memories : memories,
      activeTools: tools,
      awaitingApproval: workDetail?.awaitingApproval,
      rawRecentEvents: workDetail?.rawEvents,
      tokens: daemonStatus?.context?.estimatedTokens ?? workDetail?.tokens ?? 0,
      maxTokens: daemonStatus?.context?.maxTokens ?? workDetail?.maxTokens ?? 16000,
      requestId: workDetail?.requestId,
    };
  }, [workDetail, daemonStatus]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const themeTone: ThemeTone = theme === "dark" ? "dark" : "light";

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
      <motion.div
        animate={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
        className={`fixed inset-y-0 left-0 z-40 lg:static lg:z-auto lg:translate-x-0 overflow-hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
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
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </motion.div>

      {/* Sidebar Resizable Drag Handle */}
      {!sidebarCollapsed && (
        <div
          onPointerDown={handleSidebarPointerDown}
          onPointerMove={handleSidebarPointerMove}
          onPointerUp={handleSidebarPointerUp}
          aria-label="Resize sidebar"
          className="group relative z-40 hidden w-1.5 cursor-col-resize select-none items-center justify-center transition-colors hover:bg-primary/40 lg:flex active:bg-primary"
          title="拖拽调整侧边栏宽度"
        >
          <div className="h-8 w-1 rounded-full bg-border/80 transition-colors group-hover:bg-primary" />
        </div>
      )}

      {/* Center: Goal/Plan/Activity Work view */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Header — only when inside a Work */}
        {activeWorkId && (
          <SessionHeader
            title={workDetail?.title ?? `Work ${activeWorkId.slice(0, 8)}…`}
            subtitle={
              workDetail?.workspaceRoot
                ? `根路径: ${workDetail.workspaceRoot}`
                : workDetail?.status
                  ? workStatusLabel(workDetail.status)
                  : undefined
            }
            model={selectedModelId}
            running={running}
            theme={theme}
            onToggleTheme={toggle}
            contextOpen={inspectorOpen}
            onToggleContext={() => setInspectorOpen((o) => !o)}
            onToggleSidebar={toggleSidebarCollapse}
            sidebarCollapsed={sidebarCollapsed}
            onCancelWork={handleCancelWork}
          />
        )}

        <div ref={scrollRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto bg-background">
          {!activeWorkId ? (
            <WelcomeView
              model={selectedModelId}
              theme={theme}
              onToggleTheme={toggle}
              contextOpen={inspectorOpen}
              onToggleContext={() => setInspectorOpen((o) => !o)}
              onToggleSidebar={toggleSidebarCollapse}
              sidebarCollapsed={sidebarCollapsed}
              onSelectPrompt={(p) => handleStartWork(p)}
              intentChips={INTENT_CHIPS}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenPalette={() => setPaletteOpen(true)}
            />
          ) : (
            <div className="mx-auto w-full max-w-[52rem] px-4 py-6 sm:px-6 sm:py-8">
              {/* Render Goal & Plan for tasks/projects or when explicit goal/plan exists */}
              {(workDetail?.uiKind !== "conversation" ||
                Boolean(workDetail?.goal) ||
                (workDetail?.plan && workDetail.plan.length > 0)) && (
                <>
                  {/* 1. Goal */}
                  <div className="mb-5">
                    <GoalPanel
                      goal={workDetail?.goal ?? ""}
                      workId={activeWorkId || undefined}
                      onSave={handleSaveGoal}
                      onExtractSkill={async (id) => {
                        try {
                          const res = await fetch(`/api/works/${id}/extract-skill`, {
                            method: "POST",
                          });
                          if (res.ok) {
                            setSettingsOpen(true);
                          }
                        } catch {
                          /* ignore */
                        }
                      }}
                      disabled={running || !workDetail}
                      status={workDetail?.status ?? "active"}
                    />
                  </div>

                  {/* 2. Plan Tracker */}
                  <div className="mb-5">
                    <PlanTracker
                      steps={workDetail?.plan ?? []}
                      onChange={handlePlanChange}
                      editable={
                        !running &&
                        workDetail?.status !== "completed" &&
                        workDetail?.status !== "failed"
                      }
                    />
                  </div>
                </>
              )}

              {/* 3. Activity Timeline */}
              <div>
                <ActivityTimeline
                  steps={workDetail?.timeline ?? []}
                  isRunning={running}
                  onApprove={(id) =>
                    resolveApprovalForTimeline(id, "approve", resolveApproval, approvalQueue)
                  }
                  onDeny={(id) =>
                    resolveApprovalForTimeline(id, "deny", resolveApproval, approvalQueue)
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Pinned bottom: Permission Dock + Composer */}
        <div className="shrink-0">
          {(approvalQueue || workDetail?.awaitingApproval) && (
            <PermissionDock
              toolName={approvalQueue?.toolName ?? workDetail?.awaitingApproval?.toolName ?? "tool"}
              args={approvalQueue?.args ?? {}}
              argsSummary={approvalQueue?.argsSummary}
              onApproveOnce={() => resolveApproval("approve")}
              onApproveSession={() => resolveApproval("approve")}
              onDeny={() => resolveApproval("deny")}
            />
          )}

          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => handleStartWork(input.trim())}
            onSteer={handleSteer}
            onStop={() => setRunning(false)}
            running={running}
            mode="chat"
            workTitle={activeWorkId ? (workDetail?.title ?? null) : null}
            workspaceRoot={activeWorkId ? (workDetail?.workspaceRoot ?? null) : draftWorkspaceRoot}
            onSelectWorkspace={handleSetWorkspaceRoot}
            selectedModel={selectedModelId}
            modelOptions={modelOptions}
            onSelectModel={setSelectedModelId}
          />
        </div>
      </div>

      {/* Right Inspector */}
      <AnimatePresence>
        {inspectorOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close Inspector"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInspectorOpen(false)}
              className="fixed inset-0 z-30 bg-foreground/20 xl:hidden"
            />
            {/* Inspector Resizable Drag Handle */}
            <div
              onPointerDown={handleInspectorPointerDown}
              onPointerMove={handleInspectorPointerMove}
              onPointerUp={handleInspectorPointerUp}
              aria-label="Resize inspector"
              className="group relative z-40 hidden w-1.5 cursor-col-resize select-none items-center justify-center transition-colors hover:bg-primary/40 xl:flex active:bg-primary"
              title="拖拽调整 Inspector 宽度"
            >
              <div className="h-8 w-1 rounded-full bg-border/80 transition-colors group-hover:bg-primary" />
            </div>
            <motion.div
              initial={{ x: inspectorWidth, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: inspectorWidth, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              style={{ width: inspectorWidth }}
              className="fixed inset-y-0 right-0 z-40 xl:static xl:z-auto"
            >
              <ContextPanel data={inspectorData} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Command Palette */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNewSession={handleNewWork}
        onExportBundle={handleExportBundle}
        onToggleTheme={toggle}
        theme={theme}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={themeTone}
        onThemeChange={(t) => setTheme(t === "dark" ? "dark" : "light")}
        accentColor={accentHex}
        onAccentChange={setAccentHex}
        models={modelOptions}
        selectedModelId={selectedModelId}
        onModelChange={handleModelChange}
        secretConfigured={secretConfigured}
        secretPreview={secretPreview(getApiSecret())}
        onSecretClear={() => {
          try {
            localStorage.removeItem("hachimi_api_secret");
          } catch {
            /* ignore */
          }
          setApiSecret("");
          setSecretConfigured(false);
        }}
        onSecretPaste={(raw) => {
          setApiSecret(raw.trim());
          setSecretConfigured(true);
        }}
        onExportBundle={handleExportBundle}
        onImportBundle={handleImportBundle}
        bundleBusy={bundleBusy}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function describeEvent(e: any): string {
  try {
    switch (e.type) {
      case "session_started":
        return "会话开始";
      case "user_message":
        return `用户: ${String((e.payload ?? {}).content ?? e.summary ?? "").slice(0, 40)}`;
      case "assistant_message":
        return `助手: ${String((e.payload ?? {}).content ?? e.summary ?? "").slice(0, 40)}`;
      case "tool_call":
        return `调用 ${String((e.payload ?? {}).toolName ?? "")}`;
      case "tool_result":
        return `结果 ${String((e.payload ?? {}).toolName ?? "")}`;
      case "approval_requested":
        return `请求批准: ${String((e.payload ?? {}).toolName ?? "")}`;
      case "approval_granted":
        return `批准 ${String((e.payload ?? {}).toolName ?? "")}`;
      case "approval_denied":
        return `拒绝 ${String((e.payload ?? {}).toolName ?? "")}`;
      case "steer":
        return `纠偏: ${String(e.summary ?? "").slice(0, 30)}`;
      case "run_finished":
        return "回合结束";
      case "error":
        return `错误: ${String(e.summary ?? (e.payload ?? {}).message ?? "").slice(0, 40)}`;
      default:
        return String(e.summary ?? e.type ?? "");
    }
  } catch {
    return "";
  }
}

function workStatusLabel(s: WorkItem["status"]): string {
  switch (s) {
    case "active":
      return "执行中";
    case "waiting":
      return "等待";
    case "blocked":
      return "阻塞";
    case "completed":
      return "已完成";
    case "cancelled":
      return "已取消";
    case "failed":
      return "失败";
    case "archived":
      return "已归档";
  }
}

function extractMemoryFromTimeline(steps: TimelineActivityStep[]): ContextPanelData["memories"] {
  // 从 assistant message block 中提取 @memory 引用（启发式，供 Inspector 渲染）
  const out: ContextPanelData["memories"] = [];
  const textFromAssistant: string[] = [];
  for (const s of steps) {
    if (s.type === "message" && s.role === "assistant" && typeof s.content === "string") {
      textFromAssistant.push(s.content);
    }
  }
  // Dummy projection: 用确定性的伪记忆展示 UI 布局；真实版本由 Core 提供 memory projection
  const demos: ContextPanelData["memories"] = [
    {
      id: "m_demo_lang",
      kind: "preference",
      text: "代码注释与新日志文案优先英文，面向用户的助手回复可用中文",
      when: "3 天前",
      hits: 2,
    },
    {
      id: "m_demo_project",
      kind: "project",
      text: "Hachimi 是 local-first 个人 AI assistant harness，多通道共用一个 HarnessRuntime",
      when: "1 周前",
      hits: 5,
    },
  ];
  // 若 timeline 中确实出现 "记忆" 关键词，再加一条 context-aware 的
  if (textFromAssistant.some((t) => t.includes("记忆") || t.includes("memory"))) {
    demos.unshift({
      id: "m_timeline_detected",
      kind: "fact",
      text: "本轮助手明确引用了长期记忆条目",
      when: "本轮",
      hits: 1,
    });
  }
  return demos.concat(out);
}

function inferActiveToolsFromWork(work: LoadedWorkDetail | null): ContextPanelData["activeTools"] {
  const tools = new Map<
    string,
    { permission: "safe" | "needs_confirm" | "dangerous"; desc: string }
  >();

  // 基础工具集合（常见默认展示）
  const defaults: ContextPanelData["activeTools"] = [
    {
      name: "shell.exec",
      permission: "needs_confirm",
      description: "在沙箱内执行命令（30s 上限，PathJail）",
    },
    {
      name: "fs.readFile",
      permission: "safe",
      description: "读取工作区内文件内容",
    },
    {
      name: "fs.writeFile",
      permission: "needs_confirm",
      description: "写入或修改工作区内文件",
    },
    {
      name: "web.search",
      permission: "safe",
      description: "联网搜索与网页抓取",
    },
  ];
  for (const d of defaults) {
    tools.set(d.name, { permission: d.permission, desc: d.description });
  }

  // 用 work 的 timeline/plan 推断：真正在执行中暴露过的工具
  if (work?.timeline) {
    for (const s of work.timeline) {
      if (s.type === "tool") {
        const name = typeof s.toolName === "string" ? s.toolName : "unknown";
        if (!tools.has(name)) {
          tools.set(name, {
            permission: s.isToolError ? "needs_confirm" : "safe",
            desc: "在当前 Work 中被调用过",
          });
        }
      }
    }
  }
  return Array.from(tools.entries()).map(([name, v]) => ({
    name,
    permission: v.permission,
    description: v.desc,
  }));
}

/**
 * Timeline 内嵌 approval 的决策分发：
 * 如果 approvalId 与当前在 PermissionDock 的 pending 相匹配，直接 resolve；
 * 否则我们回退到通用 approveTool API。
 */
async function resolveApprovalForTimeline(
  approvalId: string,
  decision: "approve" | "deny",
  resolve: (d: "approve" | "deny") => Promise<void>,
  activeQueue: { approvalId?: string } | null
) {
  if (activeQueue && activeQueue.approvalId === approvalId) {
    await resolve(decision);
    return;
  }
  // 否则直接调用 API
  await approveTool(approvalId, decision);
}

function findLastItem<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return arr[i];
  }
  return undefined;
}
