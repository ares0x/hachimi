// apps/desktop/electron/main.ts
import { type ChildProcess, spawn } from "node:child_process";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  nativeImage,
  shell,
  Tray,
} from "electron";
import { DaemonLifecycle, type DaemonLifecycleResult } from "./daemon-lifecycle.js";
import {
  buildTrayMenuTemplate,
  computeDockBadgeCount,
  notificationPayloadForApproval,
  notificationPayloadForTask,
  type TrayMenuTemplateItem,
  type TrayState,
} from "./native-bridge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DAEMON_PORT = Number(process.env.HACHIMI_DESKTOP_PORT || 3700);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;
let isQuitting = false;
let daemonResult: DaemonLifecycleResult | null = null;
const trayState: TrayState = {
  works: [],
  activeWorkId: undefined,
  runningTasks: 0,
  pendingApprovals: 0,
  daemonOnline: false,
};

// ─── Single instance (L1-D1) ────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  console.warn(
    "[Hachimi Desktop] 已有 Hachimi 实例在运行，本次启动将退出并聚焦已有窗口。若旧窗口白屏/无响应，请先退出旧实例再启动。"
  );
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });

  ipcMain.handle("dialog:selectFolder", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "选择项目工作区目录",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // L1: 原生通知（由 renderer 请求，经 main 弹出；点击聚焦窗口）
  ipcMain.handle("notify", (_event, payload: { title?: string; body?: string }) => {
    if (!payload?.title && !payload?.body) return false;
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title: payload.title || "Hachimi",
      body: payload.body || "",
      silent: false,
    });
    n.on("click", () => showWindow());
    n.show();
    return true;
  });

  // L1: 角标更新（renderer 上报审批/任务计数）
  ipcMain.handle("setDockBadge", (_event, count: number | null) => {
    if (process.platform === "darwin") {
      app.dock.setBadge(count && count > 0 ? String(count) : "");
    }
    return true;
  });

  app.whenReady().then(() => {
    createTray();
    registerGlobalShortcuts();
    // 先等 daemon 就绪（含端口回退），再用解析后的端口加载窗口
    void (async () => {
      await ensureDaemonRunning();
      await createWindow();
    })();
    startStatusPolling();
  });
}

// ─── Daemon lifecycle (L1-D1) ───────────────────────────────────────────────

function isDaemonListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function spawnDaemon(port: number): { pid?: number } {
  const rootDir = join(__dirname, "../../../");
  const serverScript = join(rootDir, "apps/server/src/main.ts");
  serverProcess = spawn("npx", ["tsx", serverScript], {
    cwd: rootDir,
    env: { ...process.env, HACHIMI_PORT: String(port) },
    stdio: "inherit",
    detached: false,
  });
  serverProcess.on("exit", () => {
    serverProcess = null;
  });
  return { pid: serverProcess.pid };
}

const daemonLifecycle = new DaemonLifecycle({
  port: DAEMON_PORT,
  isListening: isDaemonListening,
  spawnDaemon,
  maxWaitMs: 30_000,
});

async function ensureDaemonRunning(): Promise<void> {
  daemonResult = await daemonLifecycle.ensureRunning();
  trayState.daemonOnline = daemonResult.state !== "failed";
  refreshTray();
  console.log(
    `[Hachimi Desktop] Daemon ${daemonResult.mode} on port ${daemonResult.port} (${daemonResult.state})`
  );
  if (daemonResult.error) {
    console.error(`[Hachimi Desktop] ${daemonResult.error}`);
  }
}

// ─── Window / tray / badge (L1-D2/D10) ──────────────────────────────────────

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    // 页面 ready 后再显示，避免启动白屏闪烁
    show: false,
    icon: join(__dirname, "../public/hachimi-mark.png"),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;

  const resolveTargetUrl = () =>
    process.env.VITE_DEV_SERVER_URL || `http://127.0.0.1:${daemonResult?.port ?? DAEMON_PORT}`;
  const reloadWindow = () => {
    if (win && !win.isDestroyed()) {
      void win.loadURL(resolveTargetUrl()).catch(() => {
        /* retry loop covers failures */
      });
    }
  };

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });
  win.webContents.on("did-finish-load", () => {
    if (!win.isDestroyed()) win.show();
  });

  // 白屏防线：主框架加载失败时记录并重试（daemon/vite 启动竞态），最多 5 次
  let loadFailures = 0;
  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return; // -3 = ERR_ABORTED（跳转/取消，非错误）
      console.error(
        `[Hachimi Desktop] 页面加载失败 (${errorCode}) ${errorDescription} → ${validatedURL}`
      );
      if (loadFailures < 5 && !isQuitting) {
        loadFailures++;
        setTimeout(reloadWindow, 1200);
      }
    }
  );

  // 渲染进程崩溃（render-process-gone）→ 记录并自动重载，避免白屏卡死
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[Hachimi Desktop] 渲染进程异常退出: ${details.reason}`);
    if (!isQuitting) {
      setTimeout(reloadWindow, 1000);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // L1: 关闭 → 隐藏到托盘（仅显式退出才真正退出）
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    mainWindow = null;
  });

  await win.loadURL(resolveTargetUrl());
}

function showWindow() {
  if (!mainWindow) {
    void createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  // 旧实例白屏自愈：从未加载成功或渲染进程已崩溃时，聚焦即重载
  const current = mainWindow.webContents.getURL();
  if (
    mainWindow.webContents.isCrashed() ||
    !current ||
    current === "about:blank" ||
    current.startsWith("chrome-error://")
  ) {
    const target =
      process.env.VITE_DEV_SERVER_URL || `http://127.0.0.1:${daemonResult?.port ?? DAEMON_PORT}`;
    void mainWindow.loadURL(target).catch(() => {
      /* retry via did-fail-load */
    });
  }
}

function createTray() {
  try {
    const iconPath = join(__dirname, "../public/hachimi-mark.png");
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip("Hachimi Agent");
    refreshTray();
  } catch (err) {
    console.error("[Hachimi Desktop] Tray creation failed:", err);
  }
}

function refreshTray() {
  if (!tray) return;
  const template = buildTrayMenuTemplate(trayState);
  tray.setContextMenu(
    Menu.buildFromTemplate(template.map((item) => mapTrayItem(item)).filter(Boolean) as any)
  );
}

function mapTrayItem(item: TrayMenuTemplateItem): any {
  const base: any = {
    label: item.label,
    type: item.type,
    enabled: item.enabled ?? true,
    checked: item.checked,
  };
  if (item.type === "separator") return { type: "separator" };
  if (item.type === "submenu") {
    return {
      ...base,
      submenu: (item.submenu ?? []).map((s) => mapTrayItem(s)).filter(Boolean),
    };
  }
  if (item.click) {
    base.click = () => onTrayAction(item.click!);
  }
  return base;
}

function onTrayAction(action: string) {
  if (action === "quit") {
    isQuitting = true;
    daemonLifecycle.stop();
    app.quit();
    return;
  }
  if (action === "toggleWindow") {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      showWindow();
    }
    return;
  }
  if (action.startsWith("focusWork:")) {
    showWindow();
    mainWindow?.webContents.send("tray-action", action);
    return;
  }
  if (action === "openTasks" || action === "openApprovals") {
    showWindow();
    mainWindow?.webContents.send("tray-action", action);
  }
}

// ─── Status polling (tray + badge) (L1-D10) ─────────────────────────────────

// 后台任务状态快照（taskId → status），用于运行中 → 终态的完成/失败通知
const lastTaskStatus = new Map<string, string>();
let lastApprovalCount = 0;

function notifyTaskFinished(task: {
  taskId: string;
  status: string;
  label?: string;
  exitCode?: number | null;
}) {
  if (!Notification.isSupported()) return;
  const payload = notificationPayloadForTask({
    taskId: task.taskId,
    status: task.status,
    label: task.label,
    exitCode: task.exitCode,
  });
  const n = new Notification({ title: payload.title, body: payload.body });
  n.on("click", () => showWindow());
  n.show();
}

async function notifyApprovalWaiting() {
  if (!Notification.isSupported()) return;
  try {
    const port = daemonResult?.port ?? DAEMON_PORT;
    const res = await fetch(`http://127.0.0.1:${port}/api/approvals`, {
      headers: process.env.HACHIMI_API_SECRET
        ? { authorization: `Bearer ${process.env.HACHIMI_API_SECRET}` }
        : {},
    });
    if (!res.ok) return;
    const body = (await res.json()) as {
      approvals?: Array<{ toolName?: string }>;
    };
    const toolName = body.approvals?.[0]?.toolName;
    if (!toolName) return;
    const payload = notificationPayloadForApproval(toolName);
    const n = new Notification({ title: payload.title, body: payload.body });
    n.on("click", () => showWindow());
    n.show();
  } catch {
    /* ignore */
  }
}

function startStatusPolling() {
  setInterval(async () => {
    const port = daemonResult?.port ?? DAEMON_PORT;
    try {
      const headers: Record<string, string> = process.env.HACHIMI_API_SECRET
        ? { authorization: `Bearer ${process.env.HACHIMI_API_SECRET}` }
        : {};
      const [statusRes, tasksRes] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/api/status`, { headers }),
        fetch(`http://127.0.0.1:${port}/api/tasks`, { headers }),
      ]);
      if (!statusRes.ok || !tasksRes.ok) {
        trayState.daemonOnline = false;
        refreshTray();
        return;
      }
      const status = (await statusRes.json()) as {
        pendingApprovals?: number;
        runningTasks?: number;
      };
      const tasks =
        (
          (await tasksRes.json()) as {
            tasks?: Array<{
              taskId: string;
              status: string;
              label?: string;
              exitCode?: number | null;
            }>;
          }
        ).tasks ?? [];

      trayState.daemonOnline = true;
      trayState.pendingApprovals = status.pendingApprovals ?? 0;
      trayState.runningTasks = status.runningTasks ?? 0;
      refreshTray();
      const badge = computeDockBadgeCount({
        pendingApprovals: trayState.pendingApprovals,
        runningTasks: trayState.runningTasks,
      });
      if (process.platform === "darwin") {
        app.dock.setBadge(badge && badge > 0 ? String(badge) : "");
      }

      // B10: 任务运行中 → 终态时弹原生通知；审批计数上升时弹审批通知
      for (const task of tasks) {
        const prev = lastTaskStatus.get(task.taskId);
        lastTaskStatus.set(task.taskId, task.status);
        if (prev === "running" && task.status !== "running") {
          notifyTaskFinished(task);
        }
      }
      if (status.pendingApprovals !== undefined && status.pendingApprovals > lastApprovalCount) {
        void notifyApprovalWaiting();
      }
      lastApprovalCount = status.pendingApprovals ?? 0;
    } catch {
      trayState.daemonOnline = false;
      refreshTray();
    }
  }, 3000);
}

// ─── Global shortcut (L1-D10) ───────────────────────────────────────────────

function registerGlobalShortcuts() {
  const ok = globalShortcut.register("CommandOrControl+Shift+H", () => {
    showWindow();
  });
  if (!ok) {
    console.warn("[Hachimi Desktop] Failed to register global shortcut Cmd/Ctrl+Shift+H");
  }
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  daemonLifecycle.stop();
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on("window-all-closed", () => {
  // L1: 关闭到托盘 — 不因窗口关闭退出（显式 Quit 才退出）
});

app.on("activate", () => {
  showWindow();
});
