import { contextBridge, ipcRenderer } from "electron";

export interface DesktopNotifyPayload {
  title?: string;
  body?: string;
}

contextBridge.exposeInMainWorld("__HACHIMI_DESKTOP__", {
  platform: process.platform,
  isDesktop: true,
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
  // L1: 原生通知桥（权限在 Settings 中管理）
  notify: (payload: DesktopNotifyPayload) => ipcRenderer.invoke("notify", payload),
  // L1: 角标计数（审批 + 运行任务）
  setDockBadge: (count: number | null) => ipcRenderer.invoke("setDockBadge", count),
  // L1: 托盘动作 → renderer（focusWork / openTasks / openApprovals）
  onTrayAction: (cb: (action: string) => void) => {
    const listener = (_event: unknown, action: string) => cb(action);
    ipcRenderer.on("tray-action", listener);
    return () => ipcRenderer.removeListener("tray-action", listener);
  },
});
