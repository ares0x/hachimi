// packages/core/src/tools/builtin/meta/sleep-timer.ts
import type { ToolDefinition } from "../../types.js";

export const sleepTimerTool: ToolDefinition = {
  name: "sleep_timer",
  kind: "read",
  description:
    "Waits for a specified duration in seconds without holding a shell process. Useful when polling background tasks, CI builds, or waiting for external events.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      seconds: {
        type: "number",
        description: "Duration to sleep in seconds (e.g. 5, 10, 30; max 120)",
      },
      reason: {
        type: "string",
        description: "Optional reason for sleeping (e.g. 'Waiting for dev server startup')",
      },
    },
    required: ["seconds"],
  },
  async execute(args) {
    const seconds = Math.min(Math.max(Number(args.seconds || 1), 1), 120);
    const reason = args.reason ? String(args.reason).trim() : "Periodic poll wait";

    const startMs = Date.now();
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

    return `[Sleep Timer Finished]: Slept for ${elapsedSec}s. Reason: "${reason}". Ready for next step.`;
  },
};
