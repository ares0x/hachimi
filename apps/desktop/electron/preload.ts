import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("__HACHIMI_DESKTOP__", {
  platform: process.platform,
  isDesktop: true,
});
