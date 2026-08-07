import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: "electron/main.ts",
      },
      {
        entry: "electron/preload.ts",
        // Electron 沙箱渲染器只支持 CJS preload（ESM preload 需 .mjs + sandbox:false）。
        // package.json 为 "type": "module"，必须显式输出 cjs 并命名为 .cjs，
        // 否则 main 引用 .js 时会被 Node 按 ESM 解析而加载失败。
        vite: {
          build: {
            lib: {
              entry: "electron/preload.ts",
              formats: ["cjs"],
              fileName: () => "preload.cjs",
            },
            rollupOptions: {
              output: {
                format: "cjs",
              },
            },
          },
        },
        onstart(options) {
          options.reload();
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    open: false,
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE || "http://127.0.0.1:3700",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if (res && !res.headersSent && "writeHead" in res) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Daemon server (3700) is offline" }));
            }
          });
        },
      },
    },
  },
});
