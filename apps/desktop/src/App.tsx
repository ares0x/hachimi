import {
  ActivityTimeline,
  ApprovalsPanel,
  exportBundle as apiExportBundle,
  importBundle as apiImportBundle,
  approveTool,
  BackgroundTasksPanel,
  browseDirectory,
  CommandPalette,
  Composer,
  ContextPanel,
  type ContextPanelData,
  cancelWork,
  createProject,
  createWork,
  deleteProject,
  deleteSession,
  deleteWork,
  fetchDaemonConfig,
  fetchProject,
  fetchProjects,
  fetchSession,
  fetchStatus,
  fetchWork,
  fetchWorkActivities,
  fetchWorkEvents,
  fetchWorks,
  GoalPanel,
  OfflineScreen,
  PermissionDock,
  PlanTracker,
  type PlanStep as PlanTrackerStep,
  type ProjectItem,
  ProjectView,
  SessionHeader,
  type ModelOption as SettingsModelOption,
  SettingsPanel,
  type SettingsTab,
  ShortcutsDialog,
  sendSteerPrompt,
  streamChatPrompt,
  type ThemeTone,
  type ActivityStep as TimelineActivityStep,
  UsagePanel,
  updateDaemonConfig,
  updateProject,
  updateWork,
  updateWorkGoal,
  updateWorkPlan,
  useTheme,
  WelcomeView,
  type WorkItem,
  WorkList,
} from "@hachimi/ui";
import { AnimatePresence, motion } from "motion/react";
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
  uiKind?: "conversation" | "task" | "project";
  workspaceRoot?: string;
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
    diff?: string;
  };
  /** Work.metadata（含无痕模式 incognito 等） */
  metadata?: Record<string, unknown>;
}

function buildModelOptions(cfg: {
  activeProvider: string;
  activeConnectionId?: string;
  connections?: Array<{
    id: string;
    name: string;
    model: string;
    models?: string[];
    enabledModels?: string[];
    enabled?: boolean;
    hasKey: boolean;
  }>;
  providers: Array<{
    id: string;
    model: string;
    models?: string[];
    hasKey: boolean;
    baseURL?: string;
  }>;
}): SettingsModelOption[] {
  const options: SettingsModelOption[] = [];
  const connList = cfg.connections?.length ? cfg.connections : null;
  const source = connList
    ? connList
        .filter(
          // Ready gate: enabled + hasKey (mock/ollama always ready)
          (c) => c.enabled !== false && (c.hasKey || c.id === "mock" || c.id === "ollama")
        )
        .map((c) => ({
          id: c.id,
          model: c.model,
          models: c.models,
          enabledModels: c.enabledModels,
          hasKey: c.hasKey,
        }))
    : cfg.providers
        .filter((p) => p.hasKey || p.id === "mock" || p.id === "ollama")
        .map((p) => ({
          id: p.id,
          model: p.model,
          models: p.models,
          enabledModels: undefined,
          hasKey: p.hasKey,
        }));
  for (const p of source) {
    // 聊天页只展示用户在设置中勾选启用的模型（enabledModels 优先）
    const list =
      p.enabledModels && p.enabledModels.length > 0
        ? p.enabledModels
        : p.models && p.models.length > 0
          ? p.models
          : [p.model];
    for (const m of list) {
      options.push({
        id: `${p.id}:${m}`,
        name: `${p.id} · ${m}`,
        speed:
          m.includes("flash") || p.id === "mock"
            ? "fast"
            : m.includes("pro") || m.includes("reasoner") || m.includes("opus")
              ? "thorough"
              : "balanced",
        providerId: p.id,
      });
    }
  }
  return options;
}

/**
 * 从 daemon 配置解析当前激活连接对应的选项 id（`provider:model` 格式），
 * 用于 Composer/设置中高亮显示真实激活的模型，避免 UI 与 daemon 脱节。
 */
function resolveActiveModelOptionId(cfg: {
  activeConnectionId?: string;
  activeProvider: string;
  connections?: Array<{ id: string; model: string }>;
  providers: Array<{ id: string; model: string }>;
}): string | null {
  const activeConnId = cfg.activeConnectionId || cfg.activeProvider;
  const conn = cfg.connections?.find((c) => c.id === activeConnId);
  if (conn?.model) return `${conn.id}:${conn.model}`;
  const prov = cfg.providers.find((p) => p.id === cfg.activeProvider);
  if (prov?.model) return `${prov.id}:${prov.model}`;
  return null;
}

export function App() {
  const { theme, setTheme, toggle } = useTheme();
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null);
  /** V1.2: 当前打开的项目（项目视图，聚合其下 Works） */
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<{
    project: ProjectItem;
    works: WorkItem[];
  } | null>(null);
  /** 项目视图「新建任务」聚焦 Composer 的重挂载 nonce */
  const [composerNonce, setComposerNonce] = useState(0);
  /** "模型的眼睛"：视觉协助进行中状态（SSE 实时推送） */
  const [visionStatus, setVisionStatus] = useState<{ model: string; imageCount: number } | null>(
    null
  );
  const [workDetail, setWorkDetail] = useState<LoadedWorkDetail | null>(null);
  /** 重新生成时被替换的旧回合步骤（UI 投影隐藏；事件日志保持 append-only） */
  const [hiddenStepIds, setHiddenStepIds] = useState<Set<string>>(new Set());
  const [draftWorkspaceRoot, setDraftWorkspaceRoot] = useState<string | null>(null);
  const [daemonStatus, setDaemonStatus] = useState<any>(null);
  /** daemon 是否在线：null=未检测（首屏不闪恢复页），false=离线全屏恢复视图 */
  const [daemonOnline, setDaemonOnline] = useState<boolean | null>(null);
  const [offlineChecking, setOfflineChecking] = useState(false);

  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  /** 当前激活连接为 Mock 时提示用户（避免把复读当正常回复） */
  const [mockActive, setMockActive] = useState(false);
  const [approvalQueue, setApprovalQueue] = useState<{
    approvalId?: string;
    toolName: string;
    args: Record<string, unknown>;
    argsSummary?: any;
    diff?: string;
  } | null>(null);
  /** 审批等待超时提示（服务端已 resolve(false)，工具暂停） */
  const [approvalTimeoutNotice, setApprovalTimeoutNotice] = useState<string | null>(null);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsInitTab, setSettingsInitTab] = useState<SettingsTab>("general");
  // L1: 右侧抽屉面板（托盘 openTasks / openApprovals 与 ⌘K 命令入口）
  const [tasksOpen, setTasksOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("hachimi_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const isDraggingSidebar = useRef(false);
  const isDraggingInspector = useRef(false);
  const lastSidebarX = useRef(260);
  const lastSidebarTime = useRef(Date.now());
  const sidebarVelocity = useRef(0);
  const lastInspectorX = useRef(320);
  const lastInspectorTime = useRef(Date.now());
  const inspectorVelocity = useRef(0);
  /** 键盘快捷键中调用最新闭包的 incognito 切换（避免 effect 闭包过期） */
  const toggleIncognitoRef = useRef<() => void>(() => {});
  /** 键盘快捷键使用的 Work 列表 / 选择 / 新建（避免 effect 闭包过期） */
  const worksRef = useRef<WorkItem[]>([]);
  const selectWorkRef = useRef<(id: string) => void>(() => {});
  const newWorkRef = useRef<() => void>(() => {});
  const importProjectRef = useRef<() => void>(() => {});

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
      setSidebarWidth(260);
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
      setInspectorWidth(320);
    } else {
      setInspectorWidth(Math.max(280, Math.min(480, Math.round(projectedW / 20) * 20)));
    }
  };

  // Settings-managed state — synced with daemon config
  const [modelOptions, setModelOptions] = useState<SettingsModelOption[]>(FALLBACK_MODEL_OPTIONS);
  /** 从 daemon 回读配置：同步模型列表、激活模型与 Mock 状态（设置页改动后调用） */
  const refreshDaemonConfig = useCallback(async () => {
    const cfg = await fetchDaemonConfig();
    if (cfg) {
      setMockActive(cfg.activeConnectionId === "mock" || cfg.activeProvider === "mock");
      setModelOptions(buildModelOptions(cfg));
      const optionId = resolveActiveModelOptionId(cfg);
      if (optionId) {
        setSelectedModelId(optionId);
        try {
          localStorage.setItem("hachimi_model", optionId);
        } catch {
          /* ignore */
        }
      }
    }
  }, []);
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    try {
      return localStorage.getItem("hachimi_model") || DEFAULT_MODEL;
    } catch {
      return DEFAULT_MODEL;
    }
  });
  const handleModelChange = useCallback(
    async (id: string) => {
      let providerId: string | undefined;
      let modelName = id;

      if (id.includes(":")) {
        const [p, m] = id.split(":");
        providerId = p;
        modelName = m;
      }

      // 切换到 daemon 激活连接/模型（此前误调不存在的路由，选择从未生效）
      try {
        const res = await fetch("/api/llm/active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, model: modelName }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("[model-change] daemon rejected:", res.status, text);
        }
      } catch {
        console.error("[model-change] daemon unreachable, provider unchanged");
      }

      // 以 daemon 为准回读配置：UI 显示真实激活的模型，避免"以为切了、实际没有"
      const cfg = await fetchDaemonConfig();
      if (cfg) {
        setMockActive(cfg.activeConnectionId === "mock" || cfg.activeProvider === "mock");
        setModelOptions(buildModelOptions(cfg));
        const optionId = resolveActiveModelOptionId(cfg);
        if (optionId) {
          setSelectedModelId(optionId);
          try {
            localStorage.setItem("hachimi_model", optionId);
          } catch {
            /* ignore */
          }
        }
      }
    },
    [fetchDaemonConfig]
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
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        toggleIncognitoRef.current?.();
      }
      if (e.metaKey || e.ctrlKey) {
        // ⌘N — 新建对话
        if (e.key.toLowerCase() === "n") {
          e.preventDefault();
          newWorkRef.current?.();
          return;
        }
        // ⌘O — 导入/打开项目
        if (e.key.toLowerCase() === "o") {
          e.preventDefault();
          importProjectRef.current?.();
          return;
        }
        // ⌘/ — 快捷键帮助
        if (e.key === "/") {
          e.preventDefault();
          setShortcutsOpen((o) => !o);
          return;
        }
        // ⌘1–9 — 切换到第 N 个 Work（按最近更新排序）
        const num = Number.parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          const item = worksRef.current[num - 1];
          if (item) selectWorkRef.current(item.id);
          return;
        }
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setSettingsOpen(false);
        setShortcutsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebarCollapse]);

  // L1/P1: daemon 状态轮询（3s）— 在线判定 + 审批/运行任务 Dock 角标。
  // window.__HACHIMI_DESKTOP__ 仅 Electron 注入；Web 端存在性守卫安全跳过。
  useEffect(() => {
    const desktop = (window as any).__HACHIMI_DESKTOP__;

    let cancelled = false;
    const poll = async () => {
      const status = await fetchStatus();
      if (cancelled) return;
      setDaemonOnline(status !== null);
      if (status) setDaemonStatus(status);
      if (status?.llm) {
        setMockActive(status.llm.connectionId === "mock" || status.llm.provider === "mock");
      }
      if (desktop && typeof desktop.setDockBadge === "function") {
        const urgent = (status?.pendingApprovals ?? 0) + (status?.runningTasks ?? 0);
        try {
          desktop.setDockBadge(urgent > 0 ? urgent : null);
        } catch {
          /* ignore */
        }
      }
    };
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const desktop = (window as any).__HACHIMI_DESKTOP__;
    if (!desktop || typeof desktop.onTrayAction !== "function") return;
    return desktop.onTrayAction((action: string) => {
      if (action === "openTasks") {
        setTasksOpen(true);
      } else if (action === "openApprovals") {
        setApprovalsOpen(true);
      } else if (action === "toggleWindow" || action === "focusWork") {
        // 窗口显隐由 main 处理；此处仅确保列表可见
        setSidebarOpen(true);
      } else if (action.startsWith("focusWork:")) {
        const id = action.slice("focusWork:".length);
        if (id) handleSelectWork(id);
      }
    });
  }, []);

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

  const refreshProjects = useCallback(async () => {
    const list = await fetchProjects();
    setProjects(list);
  }, []);

  const refreshProjectDetail = useCallback(async (projectId: string) => {
    const detail = await fetchProject(projectId);
    if (detail) setProjectDetail(detail);
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
    setDaemonOnline(status !== null);

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
            diff:
              typeof pendingApproval.payload?.diff === "string"
                ? pendingApproval.payload.diff
                : undefined,
          }
        : undefined;

    setWorkDetail((prev) => {
      const timeline = (activities || []) as TimelineActivityStep[];
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
        metadata: work?.metadata,
      };
    });
  }, []);

  useEffect(() => {
    (async () => {
      await refreshWorksList();
      await refreshProjects();
      await refreshDaemonConfig();
    })();
  }, [refreshWorksList, refreshProjects, refreshDaemonConfig]);

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
    const w = worksRef.current.find((x) => x.id === id);
    // 非项目内 Work 清除项目上下文；项目内 Work 保留（返回项目视图仍可见）
    if (!w?.projectId) setActiveProjectId(null);
    setSidebarOpen(false);
  };

  const handleNewWork = () => {
    setActiveWorkId(null);
    setActiveProjectId(null);
    setProjectDetail(null);
    setWorkDetail(null);
    setDraftWorkspaceRoot(null);
  };

  // V1.2: 导入/打开本地目录 → 幂等升级为 Project（同一目录复用同一项目）
  const handleImportProject = async () => {
    const path = await browseDirectory();
    if (!path) return;
    const res = await createProject(path);
    if (!res) return;
    await refreshProjects();
    await refreshProjectDetail(res.project.id);
    setActiveProjectId(res.project.id);
    setActiveWorkId(null);
    setWorkDetail(null);
    setDraftWorkspaceRoot(null);
  };

  const handleSelectProject = async (projectId: string) => {
    setActiveWorkId(null);
    setWorkDetail(null);
    setActiveProjectId(projectId);
    await refreshProjectDetail(projectId);
    setSidebarOpen(false);
  };

  const handleCloseProject = () => {
    setActiveProjectId(null);
    setProjectDetail(null);
  };

  const handleRenameProject = async (name: string) => {
    if (!activeProjectId) return;
    const updated = await updateProject(activeProjectId, { name });
    if (updated) {
      setProjectDetail((prev) => (prev ? { ...prev, project: updated } : prev));
      await refreshProjects();
    }
  };

  const handleDeleteProject = async () => {
    if (!activeProjectId) return;
    const ok = await deleteProject(activeProjectId);
    if (!ok) return;
    await refreshProjects();
    await refreshWorksList();
    setActiveProjectId(null);
    setProjectDetail(null);
  };

  const handleCreateTaskInProject = () => {
    // 项目视图下 Composer 即新任务入口：重挂载触发自动聚焦
    setComposerNonce((n) => n + 1);
  };
  worksRef.current = works;
  selectWorkRef.current = handleSelectWork;
  newWorkRef.current = handleNewWork;
  importProjectRef.current = handleImportProject;

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

  /** 无痕模式：翻转当前 Work 的 metadata.incognito（不写入记忆） */
  const handleToggleIncognito = async () => {
    if (!activeWorkId) return;
    const next = !(workDetail?.metadata?.incognito === true);
    const updated = await updateWork(activeWorkId, { metadata: { incognito: next } });
    if (updated) {
      setWorkDetail((prev) =>
        prev ? { ...prev, metadata: { ...(prev.metadata ?? {}), incognito: next } } : prev
      );
    }
  };
  toggleIncognitoRef.current = handleToggleIncognito;

  /** 离线恢复页「重试连接」：立即探测一次 daemon */
  const handleRetryDaemon = async () => {
    setOfflineChecking(true);
    const status = await fetchStatus();
    setDaemonOnline(status !== null);
    setOfflineChecking(false);
    if (status) setDaemonStatus(status);
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

  const handleStartWork = async (intentText: string, attachments?: File[]) => {
    if (!intentText.trim() || running) return;
    setRunning(true);
    setInput("");
    setVisionStatus(null);
    setApprovalTimeoutNotice(null);

    // 图片附件 → base64（仅 image/*；其他文件沿用现有行为不随聊天发送）
    const imageAttachments: Array<{
      id: string;
      name: string;
      mimeType: string;
      dataBase64: string;
      dataUrl: string;
    }> = [];
    for (const file of attachments ?? []) {
      if (!file.type.startsWith("image/")) continue;
      const dataBase64 = await fileToBase64(file);
      if (dataBase64) {
        imageAttachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          mimeType: file.type,
          dataBase64,
          dataUrl: `data:${file.type};base64,${dataBase64}`,
        });
      }
    }

    let workIdToUse = activeWorkId;
    if (!workIdToUse) {
      // V1.2: 项目视图下创建的新 Work 自动绑定项目（projectId + workspaceRoot）
      const projectBoundRoot = projectDetail?.project.workspaceRoot;
      const newWork = await createWork(intentText.trim(), {
        uiKind: projectBoundRoot ? "task" : draftWorkspaceRoot ? "project" : "conversation",
        workspaceRoot: draftWorkspaceRoot || projectBoundRoot || undefined,
        projectId: activeProjectId || undefined,
      });
      if (newWork) {
        workIdToUse = newWork.id;
        setActiveWorkId(newWork.id);
        if (activeProjectId) {
          await refreshProjectDetail(activeProjectId);
        }
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
      images: imageAttachments.map((a) => a.dataUrl),
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
        setApprovalTimeoutNotice(null);
        setApprovalQueue(confirmInfo);
        setRunning(false);
      },
      async () => {
        await refreshWorksList();
        if (targetWorkId) await refreshWorkDetail(targetWorkId);
        if (activeProjectId) await refreshProjectDetail(activeProjectId);
        setRunning(false);
        setVisionStatus(null);
      },
      async (err) => {
        console.error("streamChat error:", err);
        await refreshWorksList();
        if (targetWorkId) await refreshWorkDetail(targetWorkId);
        if (activeProjectId) await refreshProjectDetail(activeProjectId);
        setRunning(false);
        setVisionStatus(null);
      },
      (timeoutInfo) => {
        // P1: 审批等待超时（服务端已 resolve(false) 并删除 approvalId）
        // 清除过期 Dock，避免用户点击后收到 404 "expired"
        setApprovalQueue(null);
        setRunning(false);
        setApprovalTimeoutNotice(
          timeoutInfo.message ||
            `工具「${timeoutInfo.toolName ?? "unknown"}」的审批等待已超时，工具调用已暂停。如需继续，请重新发送指令。`
        );
      },
      imageAttachments.length > 0 ? imageAttachments : undefined,
      (info) => {
        setVisionStatus({ model: info.model, imageCount: info.imageCount });
      }
    );
  };

  const handleRegenerate = async (step: TimelineActivityStep) => {
    if (!activeWorkId || running) return;
    const timeline = workDetail?.timeline || [];
    const stepIdx = timeline.findIndex((t) => t.id === step.id);
    if (stepIdx < 0) return;
    let userIdx = -1;
    for (let i = stepIdx; i >= 0; i--) {
      if (timeline[i].role === "user") {
        userIdx = i;
        break;
      }
    }
    if (userIdx < 0) return;
    const userStep = timeline[userIdx];
    const prompt = typeof userStep.content === "string" ? userStep.content : "";
    if (!prompt.trim()) return;
    // 隐藏旧回合（含旧用户气泡与旧回答/工具步骤），
    // 再由 handleStartWork 在同一个 Work 上重新执行并流式追加新回答。
    setHiddenStepIds((prev) => {
      const next = new Set(prev);
      for (const t of timeline.slice(userIdx)) {
        if (t.id) next.add(t.id);
      }
      return next;
    });
    await handleStartWork(prompt);
  };

  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      /* ignore */
    }
  };

  /** Read a File into a base64 string (no data URL prefix). */
  const fileToBase64 = (file: File): Promise<string | null> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

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

    const rawTools = daemonStatus?.tools || [];
    const activeTools = Array.isArray(rawTools)
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
      memories: daemonStatus?.memories || [],
      activeTools,
      awaitingApproval: workDetail?.awaitingApproval,
      rawRecentEvents: workDetail?.rawEvents,
      tokens: daemonStatus?.context?.estimatedTokens ?? workDetail?.tokens ?? 0,
      maxTokens: daemonStatus?.context?.maxTokens ?? workDetail?.maxTokens ?? 16000,
      requestId: workDetail?.requestId,
    };
  }, [workDetail, daemonStatus]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const themeTone: ThemeTone = theme === "dark" ? "dark" : "light";

  return daemonOnline === false ? (
    <OfflineScreen onRetry={handleRetryDaemon} checking={offlineChecking} />
  ) : (
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
        animate={{ width: sidebarCollapsed ? 56 : sidebarWidth }}
        transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
        className={`fixed inset-y-0 left-0 z-40 lg:static lg:z-auto lg:translate-x-0 overflow-hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <WorkList
          works={works}
          projects={projects}
          activeWorkId={activeWorkId}
          activeProjectId={activeProjectId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onSelectWork={handleSelectWork}
          onRenameWork={handleRenameWork}
          onDeleteWork={handleDeleteWork}
          onNewWork={handleNewWork}
          onSelectProject={handleSelectProject}
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
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenPalette={() => setPaletteOpen(true)}
            onCancelWork={handleCancelWork}
            incognito={workDetail?.metadata?.incognito === true}
            onToggleIncognito={handleToggleIncognito}
          />
        )}

        {mockActive && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            <span aria-hidden className="shrink-0">
              ⚠
            </span>
            <span>
              当前为 <b>Mock 模式</b>
              （模型会复读你的问题，不会真正作答）。请在设置中配置并激活真实服务商。
            </span>
            <button
              type="button"
              onClick={() => {
                setSettingsInitTab("models");
                setSettingsOpen(true);
              }}
              className="ml-auto shrink-0 font-medium underline underline-offset-2 hover:opacity-80"
            >
              去配置
            </button>
          </div>
        )}

        {approvalTimeoutNotice && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            <span aria-hidden className="shrink-0">
              ⏱️
            </span>
            <span className="min-w-0 flex-1">{approvalTimeoutNotice}</span>
            <button
              type="button"
              onClick={() => setApprovalTimeoutNotice(null)}
              className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80"
            >
              知道了
            </button>
          </div>
        )}

        <div ref={scrollRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto bg-background">
          {activeProjectId && !activeWorkId ? (
            projectDetail ? (
              <ProjectView
                project={projectDetail.project}
                works={projectDetail.works}
                onOpenWork={(id) => setActiveWorkId(id)}
                onCreateTask={handleCreateTaskInProject}
                onClose={handleCloseProject}
                onRename={handleRenameProject}
                onDelete={handleDeleteProject}
              />
            ) : (
              <div className="grid h-full place-items-center">
                <span className="font-mono text-xs text-muted-foreground">加载项目…</span>
              </div>
            )
          ) : !activeWorkId ? (
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
              hasReadyConnection={modelOptions.length > 0}
              onOpenSettings={() => {
                setSettingsInitTab("models");
                setSettingsOpen(true);
              }}
              onOpenPalette={() => setPaletteOpen(true)}
              onOpenProject={handleImportProject}
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
                </>
              )}

              {/* 3. Activity Timeline */}
              <div>
                <ActivityTimeline
                  activities={(workDetail?.timeline ?? []).filter((s) => !hiddenStepIds.has(s.id))}
                  isRunning={running}
                  onApprove={(id) =>
                    resolveApprovalForTimeline(id, "approve", resolveApproval, approvalQueue)
                  }
                  onDeny={(id) =>
                    resolveApprovalForTimeline(id, "deny", resolveApproval, approvalQueue)
                  }
                  onRegenerate={handleRegenerate}
                  onCopyMessage={handleCopyMessage}
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
              diff={approvalQueue?.diff ?? workDetail?.awaitingApproval?.diff}
              onApproveOnce={() => resolveApproval("approve")}
              onApproveSession={() => resolveApproval("approve")}
              onDeny={() => resolveApproval("deny")}
            />
          )}

          {visionStatus && (
            <div className="mx-auto mb-2 flex w-full max-w-[48rem] items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs text-primary">
              <span className="size-2 animate-pulse rounded-full bg-primary" />
              正在用 <span className="font-mono font-semibold">{visionStatus.model}</span> 查看{" "}
              {visionStatus.imageCount} 张图片…
            </div>
          )}

          <Composer
            key={composerNonce}
            value={input}
            onChange={setInput}
            onSubmit={(attachments) => handleStartWork(input.trim(), attachments)}
            onSteer={handleSteer}
            onStop={() => setRunning(false)}
            running={running}
            mode="chat"
            workTitle={activeWorkId ? (workDetail?.title ?? null) : null}
            workspaceRoot={
              activeWorkId
                ? (workDetail?.workspaceRoot ?? null)
                : activeProjectId
                  ? (projectDetail?.project.workspaceRoot ?? null)
                  : draftWorkspaceRoot
            }
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
              transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
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
        onOpenTasks={() => setTasksOpen(true)}
        onOpenUsage={() => setUsageOpen(true)}
        onOpenApprovals={() => setApprovalsOpen(true)}
        onOpenWork={(id) => handleSelectWork(id)}
      />

      {/* P1: 快捷键帮助面板（⌘/） */}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* L1: 后台任务 / 用量 / 待审批 面板（托盘 openTasks / openApprovals 落点） */}
      <AnimatePresence>
        {tasksOpen && <BackgroundTasksPanel open onClose={() => setTasksOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {usageOpen && (
          <UsagePanel
            open
            onClose={() => setUsageOpen(false)}
            onOpenWork={(id) => handleSelectWork(id)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {approvalsOpen && <ApprovalsPanel open onClose={() => setApprovalsOpen(false)} />}
      </AnimatePresence>

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          // 设置页可能修改了激活连接/Key/模型 → 回读刷新顶部状态
          void refreshDaemonConfig();
        }}
        theme={themeTone}
        onThemeChange={(t) => setTheme(t === "dark" ? "dark" : "light")}
        accentColor={accentHex}
        onAccentChange={setAccentHex}
        models={modelOptions}
        selectedModelId={selectedModelId}
        onModelChange={handleModelChange}
        initialTab={settingsInitTab}
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
