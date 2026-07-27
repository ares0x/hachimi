import { type ChildProcess, spawn } from "node:child_process";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

async function isDaemonListening(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:3700/health", (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureDaemonRunning() {
  const online = await isDaemonListening();
  if (online) {
    console.log("[Hachimi Desktop] Daemon server (3700) is already online. Attaching...");
    return;
  }

  console.log("[Hachimi Desktop] Daemon server (3700) is offline. Auto-starting Daemon...");
  const rootDir = join(__dirname, "../../../");
  const serverScript = join(rootDir, "apps/server/src/main.ts");

  serverProcess = spawn("npx", ["tsx", serverScript], {
    cwd: rootDir,
    env: { ...process.env },
    stdio: "inherit",
    detached: false,
  });

  // Wait for server to listen on 3700
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await isDaemonListening()) {
      console.log("[Hachimi Desktop] Daemon server successfully started and ready!");
      return;
    }
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    icon: join(__dirname, "../public/hachimi-mark.png"),
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Auto attach or spawn Daemon before loading URL
  await ensureDaemonRunning();

  const targetUrl = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:3700";
  mainWindow.loadURL(targetUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
