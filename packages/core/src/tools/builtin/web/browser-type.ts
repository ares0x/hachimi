// packages/core/src/tools/builtin/web/browser-type.ts
import type { ToolDefinition } from "../../types.js";
import { browserEngine } from "./browser-engine.js";

export const browserTypeTool: ToolDefinition = {
  name: "browser_type",
  kind: "write",
  group: "browser",
  description:
    "Unavailable: requires a real (Playwright) browser. In static-fetch mode this tool always returns an error explaining the limitation — do not call it.",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      selector: {
        type: "string",
        description: "CSS selector of input element (e.g. 'input[name=\"search\"]')",
      },
      text: { type: "string", description: "Text content to type into the input field" },
      clearFirst: {
        type: "boolean",
        description: "Whether to clear existing text before typing (default true)",
      },
    },
    required: ["selector", "text"],
  },
  async execute(args) {
    const selector = String(args.selector ?? "").trim();
    const text = String(args.text ?? "");
    const clearFirst = args.clearFirst !== false;

    if (!selector) return "[Error] CSS selector cannot be empty";

    return await browserEngine.typeText(selector, text, clearFirst);
  },
};
