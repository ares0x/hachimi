import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__HACHIMI_DESKTOP__", {
  platform: process.platform,
  isDesktop: true,
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
});
