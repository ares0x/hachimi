export interface ToolArgSummary {
  oneLine: string;
  fields: Array<{
    key: string;
    label: string;
    value: string;
    truncated?: boolean;
    code?: boolean;
    mono?: boolean;
  }>;
}

const getApiBase = () => {
  if (typeof window !== "undefined" && (window as any).__HACHIMI_API_BASE__) {
    return (window as any).__HACHIMI_API_BASE__;
  }
  return typeof process !== "undefined" && process.env?.VITE_API_BASE
    ? process.env.VITE_API_BASE
    : "";
};

export interface StatusData {
  status: string;
  uptime: number;
  /** L1: 托盘/角标轮询计数 */
  pendingApprovals?: number;
  runningTasks?: number;
  paths?: { dataDir: string; sessionsDir: string };
  llm?: { provider: string; model: string; connectionId?: string; hasKey?: boolean };
  context?: { tokens: number; maxTokens: number; ratio: string };
  memory?: { totalCount: number };
  session?: { id: string; title: string; messages: any[] };
}

export interface SessionItem {
  id: string;
  title: string;
  updatedAt: number;
  mode?: string;
  runs?: number;
}

let currentSecret = "";

export function setApiSecret(secret: string) {
  currentSecret = secret;
  if (typeof window !== "undefined") {
    (window as any).__HACHIMI_API_SECRET__ = secret;
    try {
      localStorage.setItem("hachimi_api_secret", secret);
    } catch {
      /* ignore */
    }
  }
}

export async function browseDirectory(): Promise<string | null> {
  // 1. Electron Desktop IPC
  const desktopObj = (typeof window !== "undefined" && (window as any).__HACHIMI_DESKTOP__) || {};
  if (typeof desktopObj.selectFolder === "function") {
    try {
      const selected = await desktopObj.selectFolder();
      if (selected) return selected;
    } catch {
      /* ignore */
    }
  }

  // 2. Local Daemon Server Native Dialog API (拉起 macOS Finder)
  try {
    const res = await fetch(`${getApiBase()}/api/browse-directory`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.path) return data.path;
    }
  } catch {
    /* ignore */
  }

  return null;
}

export function getApiSecret(): string {
  if (currentSecret) return currentSecret;
  if (typeof window !== "undefined") {
    if ((window as any).__HACHIMI_API_SECRET__) return (window as any).__HACHIMI_API_SECRET__;
    try {
      const stored = localStorage.getItem("hachimi_api_secret");
      if (stored) return stored;
    } catch {
      /* ignore */
    }
  }
  return typeof process !== "undefined" && process.env?.HACHIMI_API_SECRET
    ? process.env.HACHIMI_API_SECRET
    : "";
}

function getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const secret = getApiSecret();
  const headers: Record<string, string> = { ...customHeaders };
  if (secret) {
    headers["Authorization"] = `Bearer ${secret}`;
  }
  return headers;
}

export async function fetchStatus(): Promise<StatusData | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/status`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as StatusData;
  } catch {
    return null;
  }
}

export async function fetchSessions(): Promise<SessionItem[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/sessions`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { sessions?: SessionItem[] };
    return data.sessions || [];
  } catch {
    return [];
  }
}

export async function fetchSession(sessionId: string): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/sessions/${sessionId}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: any };
    return data.session || null;
  } catch {
    return null;
  }
}

export async function createSession(title?: string): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/sessions`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: any };
    return data.session || null;
  } catch {
    return null;
  }
}

export async function renameSession(id: string, title: string): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/sessions/${id}`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: any };
    return data.session || null;
  } catch {
    return null;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/sessions/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteWork(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/works/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendSteerPrompt(prompt: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/chat/steer`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}

export async function approveTool(
  approvalId: string,
  decision: "approve" | "deny"
): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/tools/approve`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ approvalId, decision }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ChatAttachment {
  id: string;
  name?: string;
  mimeType: string;
  dataBase64?: string;
  filePath?: string;
  url?: string;
}

export async function streamChatPrompt(
  prompt: string,
  sessionId: string,
  onChunk: (chunk: string) => void,
  onConfirmRequired?: (info: {
    approvalId?: string;
    toolName: string;
    args: Record<string, unknown>;
    argsSummary?: ToolArgSummary;
    /** 预检 diff（文件编辑类工具，由 runtime 生成并随 SSE 透传） */
    diff?: string;
  }) => void,
  onDone?: (content: string) => void,
  onError?: (err: string) => void,
  onApprovalTimeout?: (info: { approvalId?: string; toolName?: string; message?: string }) => void,
  attachments?: ChatAttachment[],
  onVisionCompanion?: (info: { model: string; imageCount: number; cacheHits: number }) => void
) {
  try {
    const res = await fetch(`${getApiBase()}/api/chat`, {
      method: "POST",
      headers: getAuthHeaders({
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      }),
      body: JSON.stringify({
        prompt,
        sessionId,
        stream: true,
        attachments: attachments?.length ? attachments : undefined,
      }),
    });

    if (!res.ok) {
      if (onError) onError(`Request failed: ${res.statusText}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      if (onError) onError("No response reader available");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk" && data.chunk) {
              onChunk(data.chunk);
            } else if (data.type === "confirm_required" && onConfirmRequired) {
              let parsedArgs: Record<string, unknown>;
              if (typeof data.args === "string") {
                try {
                  parsedArgs = JSON.parse(data.args);
                } catch {
                  parsedArgs = { _raw: data.args };
                }
              } else if (data.args && typeof data.args === "object") {
                parsedArgs = data.args as Record<string, unknown>;
              } else {
                parsedArgs = {};
              }
              onConfirmRequired({
                approvalId: data.approvalId,
                toolName: data.toolName,
                args: parsedArgs,
                argsSummary: (data.argsSummary as ToolArgSummary | undefined) || undefined,
                diff: typeof data.diff === "string" ? data.diff : undefined,
              });
            } else if (data.type === "vision_companion" && onVisionCompanion) {
              onVisionCompanion({
                model: data.model || "vision",
                imageCount: Number(data.imageCount) || 0,
                cacheHits: Number(data.cacheHits) || 0,
              });
            } else if (data.type === "done") {
              if (onDone) onDone(data.content || "");
            } else if (data.type === "approval_timeout" && onApprovalTimeout) {
              onApprovalTimeout({
                approvalId: data.approvalId,
                toolName: data.toolName,
                message: data.message,
              });
            }
          } catch {
            /* ignore JSON parse errors */
          }
        }
      }
    }
  } catch (err: any) {
    if (onError) onError(err?.message || String(err));
  }
}

export async function exportBundle(): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/export`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { bundle?: any };
    return data.bundle || null;
  } catch {
    return null;
  }
}

// ─── W1: Work API Client Adapters ─────────────────────────────────────────────

export interface WorkItem {
  id: string;
  title: string;
  uiKind?: "conversation" | "task" | "project";
  workspaceRoot?: string;
  projectId?: string;
  status: "active" | "waiting" | "blocked" | "completed" | "cancelled" | "failed" | "archived";
  kind: "primary" | "worker";
  goal?: string;
  planTotal: number;
  planDone: number;
  updatedAt: string;
  createdAt: string;
}

export async function fetchWorks(kind = "primary"): Promise<WorkItem[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/works?kind=${kind}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { works?: WorkItem[] };
    return data.works || [];
  } catch {
    return [];
  }
}

export interface ProjectItem {
  id: string;
  name: string;
  workspaceRoot: string;
  git?: { isRepo: boolean; root?: string; branch?: string };
  description?: string;
  details?: string;
  color?: string;
  memoryPath?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  workCount?: number;
}

export async function fetchProjects(): Promise<ProjectItem[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/projects`, { headers: getAuthHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { projects?: ProjectItem[] };
    return data.projects || [];
  } catch {
    return [];
  }
}

export async function createProject(
  root: string,
  name?: string
): Promise<{ project: ProjectItem; created: boolean } | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/projects`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ root, ...(name ? { name } : {}) }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { project?: ProjectItem; created?: boolean };
    if (!data.project) return null;
    return { project: data.project, created: Boolean(data.created) };
  } catch {
    return null;
  }
}

export async function fetchProject(
  id: string
): Promise<{ project: ProjectItem; works: WorkItem[] } | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/projects/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as { project?: ProjectItem; works?: WorkItem[] };
    if (!data.project) return null;
    return { project: data.project, works: data.works || [] };
  } catch {
    return null;
  }
}

export async function updateProject(
  id: string,
  patch: { name?: string; description?: string; details?: string; color?: string }
): Promise<ProjectItem | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/projects/${id}`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { project?: ProjectItem };
    return data.project || null;
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/projects/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}

export async function fetchWork(id: string): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/works/${id}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { work?: any };
    return data.work || null;
  } catch {
    return null;
  }
}

export async function createWork(
  intent: string,
  options?: {
    goal?: string;
    uiKind?: "conversation" | "task" | "project";
    workspaceRoot?: string;
    projectId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/works`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ intent, ...options }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { work?: any };
    return data.work || null;
  } catch {
    return null;
  }
}

export async function updateWork(
  id: string,
  patch: {
    title?: string;
    status?: string;
    goal?: string;
    workspaceRoot?: string;
    projectId?: string;
    uiKind?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/works/${id}`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { work?: any };
    return data.work || null;
  } catch {
    return null;
  }
}

export async function fetchWorkActivities(id: string): Promise<any[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/works/${id}/activities`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { activities?: any[] };
    return data.activities || [];
  } catch {
    return [];
  }
}

// ─── W2.2: Cancel / W2.6: Events / W3.x: Goal & Plan mutations ────────────────

export async function cancelWork(id: string, reason = "用户手动取消"): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/works/${id}/cancel`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ reason }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface WorkEventFilter {
  /** 逗号分隔或事件类型数组，如 approval_granted, approval_denied */
  type?: string | string[];
  limit?: number;
}

export async function fetchWorkEvents(id: string, filter: WorkEventFilter = {}): Promise<any[]> {
  try {
    const params = new URLSearchParams();
    if (filter.type) {
      params.set("type", Array.isArray(filter.type) ? filter.type.join(",") : filter.type);
    }
    if (filter.limit) params.set("limit", String(filter.limit));
    const qs = params.toString();
    const res = await fetch(`${getApiBase()}/api/works/${id}/events${qs ? `?${qs}` : ""}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: any[] };
    return data.events || [];
  } catch {
    return [];
  }
}

export async function updateWorkGoal(id: string, goal: string): Promise<any | null> {
  return updateWork(id, { goal });
}

export interface WorkPlanStepInput {
  id?: string;
  title: string;
  description?: string;
  status?: "pending" | "running" | "done" | "skipped";
}

export async function updateWorkPlan(id: string, steps: WorkPlanStepInput[]): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/works/${id}`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ plan: steps }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { work?: any };
    return data.work || null;
  } catch {
    return null;
  }
}

// ─── W3.7: Daemon Config Sync ──────────────────────────────────────────────────

export interface DaemonProviderInfo {
  id: string;
  model: string;
  hasKey: boolean;
  baseURL?: string;
}

export interface DaemonConnectionInfo {
  id: string;
  name: string;
  providerType: string;
  enabled: boolean;
  model: string;
  models: string[];
  enabledModels: string[];
  baseURL?: string;
  hasKey: boolean;
}

export interface DaemonConfig {
  activeProvider: string;
  activeConnectionId?: string;
  connections?: DaemonConnectionInfo[];
  providers: DaemonProviderInfo[];
}

export async function fetchDaemonConfig(): Promise<DaemonConfig | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/config`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as DaemonConfig;
  } catch {
    return null;
  }
}

export async function updateDaemonConfig(patch: {
  activeProvider?: string;
  model?: string;
}): Promise<{ activeProvider: string; model: string } | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/config`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      success?: boolean;
      activeProvider?: string;
      model?: string;
    };
    if (!data.success) return null;
    return {
      activeProvider: data.activeProvider || patch.activeProvider || "",
      model: data.model || patch.model || "default",
    };
  } catch {
    return null;
  }
}

export async function importBundle(file: File): Promise<any | null> {
  try {
    const fd = new FormData();
    fd.append("bundle", file);
    const res = await fetch(`${getApiBase()}/api/import`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: fd,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { bundle?: any };
    return data.bundle || null;
  } catch {
    return null;
  }
}

// ─── L1: Desktop P0 API Client Adapters ──────────────────────────────────────

export interface BackgroundTaskItem {
  taskId: string;
  kind: string;
  status: "running" | "completed" | "failed" | "killed";
  startedAt: number;
  completedAt?: number;
  exitCode?: number | null;
  output: string;
  label?: string;
  pid?: number;
}

export async function fetchTasks(): Promise<BackgroundTaskItem[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/tasks`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { tasks?: BackgroundTaskItem[] };
    return data.tasks || [];
  } catch {
    return [];
  }
}

export async function killTask(taskId: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/tasks/${encodeURIComponent(taskId)}/kill`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface UsageTokens {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

export interface UsageSessionRow {
  sessionId: string;
  runs: number;
  failedRuns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
  toolCalls: number;
}

export interface UsageModelRow {
  model: string;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface UsageSummaryData {
  periodFrom: string;
  periodTo: string;
  days: number;
  sessions: number;
  runs: number;
  failedRuns: number;
  tokens: UsageTokens;
  costUsd: number;
  topTools: Array<{ name: string; calls: number }>;
  topModels: UsageModelRow[];
  bySession: UsageSessionRow[];
}

export async function fetchUsage(days = 7): Promise<UsageSummaryData | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/usage?days=${Number.isFinite(days) ? days : 7}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as UsageSummaryData;
  } catch {
    return null;
  }
}

export interface SearchResultItem {
  type: "message" | "work";
  sessionId: string;
  workId?: string;
  role?: string;
  content: string;
  snippet: string;
  timestamp: string;
}

export async function searchMessages(q: string, limit = 20): Promise<SearchResultItem[]> {
  const query = q.trim();
  if (!query) return [];
  try {
    const res = await fetch(
      `${getApiBase()}/api/search?q=${encodeURIComponent(query)}&limit=${Math.min(50, Math.max(1, limit))}`,
      { headers: getAuthHeaders() }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: SearchResultItem[] };
    return data.results || [];
  } catch {
    return [];
  }
}

export interface PendingApprovalItem {
  approvalId: string;
  toolName: string;
  sessionId?: string;
  requestedAt?: number;
  argsSummary?: ToolArgSummary;
  diff?: string;
}

export async function fetchPendingApprovals(): Promise<PendingApprovalItem[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/approvals`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { approvals?: PendingApprovalItem[] };
    return data.approvals || [];
  } catch {
    return [];
  }
}
