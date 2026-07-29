import {
  ActivityTimeline,
  CommandPalette,
  Composer,
  ContextPanel,
  type ContextPanelData,
  GoalPanel,
  PermissionDock,
  PlanTracker,
  type PlanStep as PlanTrackerStep,
  SessionHeader,
  type ModelOption as SettingsModelOption,
  SettingsPanel,
  type ThemeTone,
  type ActivityStep as TimelineActivityStep,
  WelcomeView,
  type WorkItem,
  WorkList,
  exportBundle as apiExportBundle,
  importBundle as apiImportBundle,
  approveTool,
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
  getApiSecret,
  sendSteerPrompt,
  setApiSecret,
  streamChatPrompt,
  updateDaemonConfig,
  updateWork,
  updateWorkGoal,
  updateWorkPlan,
  useTheme,
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
];

const DEFAULT_MODEL = "deepseek-v4-flash";

type PlanStepRaw = PlanTrackerStep & { description?: string };

interface LoadedWorkDetail {
  id: string;
  title: string;
  goal?: string;
  status: WorkItem["status"];
  plan: PlanStepRaw[];
  timeline: TimelineActivityStep[];
  rawEvents?: { id: string; type: string; timestamp: string; summary: string; payload?: any }[];
  tokens?: number;
  maxTokens?: number;
  requestId?: string;
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

  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Settings-managed state — synced with daemon config
  const [modelOptions, setModelOptions] = useState<SettingsModelOption[]>(FALLBACK_MODEL_OPTIONS);
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    try {
      return localStorage.getItem("hachimi_model") || DEFAULT_MODEL;
    } catch {
      return DEFAULT_MODEL;
    }
  });
  const handleModelChange = useCallback(
    async (id: string) => {
      setSelectedModelId(id);
      try {
        localStorage.setItem("hachimi_model", id);
      } catch {
        /* ignore */
      }
      const result = await updateDaemonConfig({ model: id });
      if (result) {
        const provider = modelOptions.find((m) => m.id === id);
        if (provider && provider.providerId && provider.providerId !== result.activeProvider) {
          const switchResult = await updateDaemonConfig({
            activeProvider: provider.providerId,
            model: id,
          });
          if (switchResult) {
            const cfg = await fetchDaemonConfig();
            if (cfg) setModelOptions(buildModelOptions(cfg));
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

  // Keyboard shortcuts
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

    setWorkDetail({
      id: workId,
      title: work?.title ?? sess?.title ?? `Work ${workId.slice(0, 8)}`,
      goal: typeof work?.goal === "string" ? work.goal : undefined,
      status: work?.status ?? "active",
      plan,
      timeline: (activities || []) as TimelineActivityStep[],
      rawEvents,
      tokens: status?.context?.tokens ?? work?.tokens ?? 0,
      maxTokens: status?.context?.maxTokens ?? 12000,
      requestId: sess?.requestId ?? work?.requestId ?? undefined,
      awaitingApproval: awaiting,
    });
  }, []);

  useEffect(() => {
    (async () => {
      await refreshWorksList();
      setSecretConfigured(Boolean(getApiSecret()));
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
      const newWork = await createWork(intentText.trim());
      if (newWork) {
        workIdToUse = newWork.id;
        setActiveWorkId(newWork.id);
      }
    }

    await refreshWorksList();
    if (workIdToUse) await refreshWorkDetail(workIdToUse);

    const targetWorkId = workIdToUse || String(Date.now());

    await streamChatPrompt(
      intentText,
      targetWorkId,
      () => {
        // noop — 真实聊天渲染走 timeline
      },
      (confirmInfo) => {
        setApprovalQueue(confirmInfo);
        setRunning(false);
      },
      async () => {
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
      setTimeout(() => refreshWorkDetail(activeWorkId), 300);
    }
  };

  // ─── Bundle ──────────────────────────────────────────────────────────────

  const handleExportBundle = async () => {
    setBundleBusy(true);
    try {
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
        setRunning(true);
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

    return {
      currentStep: currentPlanStep
        ? {
            id: currentPlanStep.id,
            title: currentPlanStep.title,
            status: currentPlanStep.status,
            description: currentPlanStep.description,
          }
        : undefined,
      memories: [],
      activeTools: [],
      awaitingApproval: workDetail?.awaitingApproval,
      rawRecentEvents: workDetail?.rawEvents,
      tokens: workDetail?.tokens ?? 0,
      maxTokens: workDetail?.maxTokens ?? 12000,
      requestId: workDetail?.requestId,
    };
  }, [workDetail]);

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
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-[width,transform] duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          sidebarCollapsed ? "w-14" : "w-[264px]"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
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
      </div>

      {/* Center: Goal/Plan/Activity Work view */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Header — only when inside a Work */}
        {activeWorkId && (
          <SessionHeader
            title={workDetail?.title ?? `Work ${activeWorkId.slice(0, 8)}…`}
            subtitle={
              workDetail?.status
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
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenPalette={() => setPaletteOpen(true)}
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
              {/* 1. Goal */}
              <div className="mb-5">
                <GoalPanel
                  goal={workDetail?.goal ?? ""}
                  onSave={handleSaveGoal}
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

              {/* 3. Activity Timeline */}
              <div>
                <ActivityTimeline
                  activities={workDetail?.timeline ?? []}
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
          />
        </div>
      </div>

      {/* Right Inspector */}
      {inspectorOpen && (
        <>
          <button
            type="button"
            aria-label="Close Inspector"
            onClick={() => setInspectorOpen(false)}
            className="fixed inset-0 z-30 bg-foreground/20 xl:hidden"
          />
          <div className="fixed inset-y-0 right-0 z-40 w-[320px] xl:static xl:z-auto xl:w-[340px]">
            <ContextPanel data={inspectorData} />
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
    case "failed":
      return "失败";
    case "archived":
      return "已归档";
  }
}

/**
 * Timeline 内嵌 approval 的决策分发
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
  await approveTool(approvalId, decision);
}

function findLastItem<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return arr[i];
  }
  return undefined;
}
