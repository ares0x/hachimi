// packages/core/src/tools/builtin/web/browser-click.ts
import type { ToolDefinition } from "../../types.js";
import { browserEngine } from "./browser-engine.js";

export const browserClickTool: ToolDefinition = {
  name: "browser_click",
  kind: "write",
  group: "browser",
  description:
    "Unavailable: requires a real (Playwright) browser. In static-fetch mode this tool always returns an error explaining the limitation — do not call it; use web_search / mcp_fetch_url instead.",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      selector: {
        type: "string",
        description: "CSS selector of element to click (e.g. '#submit-btn', 'button.login')",
      },
      x: { type: "number", description: "Optional X screen/viewport coordinate" },
      y: { type: "number", description: "Optional Y screen/viewport coordinate" },
    },
  },
  async execute(args) {
    const selector = args.selector ? String(args.selector).trim() : undefined;
    const x = args.x !== undefined ? Number(args.x) : undefined;
    const y = args.y !== undefined ? Number(args.y) : undefined;

    if (!selector && (x === undefined || y === undefined)) {
      return "[Error] Either CSS selector or (x, y) coordinates must be provided";
    }

    const coordinate = x !== undefined && y !== undefined ? { x, y } : undefined;
    return await browserEngine.click(selector, coordinate);
  },
};
