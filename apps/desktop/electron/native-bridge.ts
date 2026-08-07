// apps/desktop/electron/native-bridge.ts
/**
 * L1 (D2/D10): Native capability helpers — Electron-free pure logic so the
 * tray layout, dock badge, and notification copy are unit-testable.
 *
 * The Electron main process maps these plain structures onto Tray / Menu /
 * Notification / app.dock APIs.
 */

export interface TrayWorkItem {
  id: string;
  title: string;
}

export interface TrayState {
  works: TrayWorkItem[];
  activeWorkId?: string;
  runningTasks: number;
  pendingApprovals: number;
  daemonOnline: boolean;
}

export interface TrayMenuTemplateItem {
  type: "normal" | "separator" | "submenu";
  label?: string;
  click?: string; // action id interpreted by main
  submenu?: TrayMenuTemplateItem[];
  enabled?: boolean;
  checked?: boolean;
}

/** Build the tray context menu from a projection snapshot. */
export function buildTrayMenuTemplate(state: TrayState): TrayMenuTemplateItem[] {
  const items: TrayMenuTemplateItem[] = [];

  items.push({
    type: "normal",
    label: state.daemonOnline ? "🌾 Hachimi — daemon online" : "🌾 Hachimi — daemon offline",
    click: "toggleWindow",
    enabled: false,
  });

  if (state.works.length > 0) {
    items.push({ type: "separator" });
    items.push({
      type: "submenu",
      label: "Works",
      submenu: state.works.slice(0, 10).map((w) => ({
        type: "normal",
        label: w.title.length > 48 ? `${w.title.slice(0, 48)}…` : w.title,
        click: `focusWork:${w.id}`,
        checked: w.id === state.activeWorkId,
      })),
    });
  }

  items.push({ type: "separator" });
  items.push({
    type: "normal",
    label: state.runningTasks > 0 ? `后台任务: ${state.runningTasks} 运行中` : "后台任务: 无",
    click: "openTasks",
    enabled: state.runningTasks > 0,
  });
  items.push({
    type: "normal",
    label: state.pendingApprovals > 0 ? `待审批: ${state.pendingApprovals}` : "待审批: 无",
    click: "openApprovals",
    enabled: state.pendingApprovals > 0,
  });

  items.push({ type: "separator" });
  items.push({ type: "normal", label: "显示主窗口", click: "toggleWindow" });
  items.push({ type: "normal", label: "退出", click: "quit" });

  return items;
}

/** Dock badge: number of urgent items, or null to clear. */
export function computeDockBadgeCount(
  state: Pick<TrayState, "pendingApprovals" | "runningTasks">
): number | null {
  const urgent = state.pendingApprovals + state.runningTasks;
  return urgent > 0 ? urgent : null;
}

export interface TaskNotificationInput {
  taskId: string;
  status: string;
  label?: string;
  exitCode?: number | null;
}

export interface NotificationPayload {
  title: string;
  body: string;
  taskId?: string;
}

/** Map a BackgroundTaskEvent to native notification copy. */
export function notificationPayloadForTask(event: TaskNotificationInput): NotificationPayload {
  const label = event.label?.trim() || "后台任务";
  switch (event.status) {
    case "completed":
      return { title: "✅ 后台任务完成", body: label, taskId: event.taskId };
    case "failed":
      return {
        title: "❌ 后台任务失败",
        body: `${label}${event.exitCode !== undefined && event.exitCode !== null ? ` (exit ${event.exitCode})` : ""}`,
        taskId: event.taskId,
      };
    case "killed":
      return { title: "⏹ 后台任务已终止", body: label, taskId: event.taskId };
    default:
      return { title: "后台任务", body: label, taskId: event.taskId };
  }
}

/** Pending-approval notification copy. */
export function notificationPayloadForApproval(toolName: string): NotificationPayload {
  return {
    title: "🔐 需要你的审批",
    body: `工具 ${toolName} 等待确认，点击打开窗口处理。`,
  };
}
