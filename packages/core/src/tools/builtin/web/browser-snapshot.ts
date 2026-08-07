// packages/core/src/tools/builtin/web/browser-snapshot.ts
import type { ToolDefinition } from "../../types.js";
import { browserEngine } from "./browser-engine.js";

export const browserSnapshotTool: ToolDefinition = {
  name: "browser_snapshot",
  kind: "read",
  group: "browser",
  description:
    "Returns a text summary of the last fetched page (static-fetch mode, no DOM/screenshot). Empty content usually means the page is JS-rendered and requires a real browser or login.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      fullPage: {
        type: "boolean",
        description: "Whether to capture full scrollable page (default false)",
      },
    },
  },
  async execute(args) {
    const fullPage = Boolean(args.fullPage);
    const snap = await browserEngine.snapshot(fullPage);

    return `[Browser Page Snapshot]\nURL: ${snap.url}\nTitle: ${snap.title}\nMode: ${snap.mode}\nContent Summary:\n${snap.textSummary}`;
  },
};
