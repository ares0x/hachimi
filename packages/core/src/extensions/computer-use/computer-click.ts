// packages/core/src/extensions/computer-use/computer-click.ts
import type { ToolDefinition } from "../../tools/types.js";
import { computerEngine } from "./computer-engine.js";

export const computerClickTool: ToolDefinition = {
  name: "computer_click",
  kind: "write",
  description:
    "Moves the OS mouse cursor and performs a click at absolute screen coordinates (x, y). " +
    "DANGEROUS: directly controls the OS mouse. Must be preceded by computer_screenshot to identify coordinates. " +
    "Requires explicit user confirmation in the permission dock before execution.",
  permission: "dangerous",
  parameters: {
    type: "object",
    properties: {
      x: { type: "number", description: "Horizontal screen coordinate in pixels from left edge" },
      y: { type: "number", description: "Vertical screen coordinate in pixels from top edge" },
      button: {
        type: "string",
        enum: ["left", "right", "middle"],
        description: "Mouse button to click (default: 'left')",
      },
    },
    required: ["x", "y"],
  },
  async execute(args) {
    const x = Number(args.x);
    const y = Number(args.y);
    const button = (args.button as "left" | "right" | "middle") ?? "left";

    if (Number.isNaN(x) || Number.isNaN(y)) {
      return "[Error] x and y must be valid numbers";
    }

    const result = await computerEngine.click(x, y, button);
    return `[Computer Click]: ${result.message}`;
  },
};
