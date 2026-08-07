// packages/core/src/tools/builtin/web/browser-navigate.ts
import type { ToolDefinition } from "../../types.js";
import { browserEngine } from "./browser-engine.js";

export const browserNavigateTool: ToolDefinition = {
  name: "browser_navigate",
  kind: "read",
  group: "browser",
  description:
    "Fetches a URL in static-fetch mode and returns the page title. Raw HTML only — no JavaScript execution. JS-rendered SPAs (social apps, search pages) return an empty shell; prefer web_search or mcp_fetch_url for dynamic content.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Target URL to navigate to (e.g. 'https://github.com')" },
      timeoutMs: {
        type: "number",
        description: "Optional navigation timeout in milliseconds (default 30000)",
      },
    },
    required: ["url"],
  },
  async execute(args) {
    const url = String(args.url ?? "").trim();
    const timeoutMs = Number(args.timeoutMs || 30000);

    if (!url) return "[Error] URL cannot be empty";

    const res = await browserEngine.navigate(url, timeoutMs);
    return `[Browser Navigated] (static-fetch mode, raw HTML, no JS): "${res.title}" (${res.url})`;
  },
};
