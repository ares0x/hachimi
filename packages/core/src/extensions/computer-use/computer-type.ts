// packages/core/src/extensions/computer-use/computer-type.ts
import type { ToolDefinition } from "../../tools/types.js";
import { computerEngine } from "./computer-engine.js";

export const computerTypeTool: ToolDefinition = {
  name: "computer_type",
  kind: "write",
  description:
    "Sends keyboard input (text string or special key combinations) to the currently active OS window. " +
    "DANGEROUS: directly controls the OS keyboard. Requires user confirmation before execution.",
  permission: "dangerous",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text string to type into the active window (e.g. 'Hello World')",
      },
      keys: {
        type: "array",
        items: { type: "string" },
        description:
          "Special key combination to press (e.g. ['cmd', 'c'] for Cmd+C, ['enter'], ['escape'], ['tab'])",
      },
    },
  },
  async execute(args) {
    const text = args.text ? String(args.text) : undefined;
    const keys = Array.isArray(args.keys) ? (args.keys as string[]) : undefined;

    if (!text && (!keys || keys.length === 0)) {
      return "[Error] Either 'text' or 'keys' must be provided";
    }

    const result = await computerEngine.type(text, keys);
    return `[Computer Type]: ${result.message}`;
  },
};
