// packages/core/src/tools/builtin/web/browser-wait.ts
import type { ToolDefinition } from "../../types.js";
import { browserEngine } from "./browser-engine.js";

export const browserWaitTool: ToolDefinition = {
  name: "browser_wait",
  kind: "read",
  group: "browser",
  description:
    "Unavailable: requires a real (Playwright) browser. In static-fetch mode this tool always returns an error explaining the limitation — do not call it.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      selector: { type: "string", description: "Optional CSS selector to wait for" },
      timeoutMs: {
        type: "number",
        description: "Maximum time to wait in milliseconds (default 10000)",
      },
    },
  },
  async execute(args) {
    const selector = args.selector ? String(args.selector).trim() : undefined;
    const timeoutMs = Number(args.timeoutMs || 10000);

    return await browserEngine.waitFor(selector, timeoutMs);
  },
};
