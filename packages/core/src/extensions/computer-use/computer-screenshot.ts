// packages/core/src/extensions/computer-use/computer-screenshot.ts
import type { ToolDefinition } from "../../tools/types.js";
import { registerToolImage } from "../../vision/index.js";
import { computerEngine } from "./computer-engine.js";

export const computerScreenshotTool: ToolDefinition = {
  name: "computer_screenshot",
  kind: "read",
  description:
    "Takes a screenshot of the OS display (macOS/Linux) to observe the current state of the desktop. Returns a textual description plus (optionally) the screenshot image for vision-capable models or the vision companion. Required before computer_click to identify target coordinates.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      displayId: {
        type: "number",
        description: "Display/monitor index to capture (default 0 = primary display)",
      },
      asImage: {
        type: "boolean",
        description:
          "Attach the screenshot image to the model context (default false — text summary only). The harness routes it to a vision model or the vision companion automatically.",
      },
    },
  },
  async execute(args) {
    const displayId = Number(args.displayId ?? 0);
    const asImage = Boolean(args.asImage);
    const result = await computerEngine.screenshot(displayId);

    const lines = [
      `[Computer Screenshot]`,
      `Platform: ${result.platform}`,
      `Resolution: ${result.width}×${result.height}`,
      `Description: ${result.description}`,
    ];

    if (result.screenshotBase64) {
      if (asImage) {
        // Register the full image; the agent loop strips the marker and
        // attaches it as an image_url content part on the next round.
        lines.push(registerToolImage(`data:image/png;base64,${result.screenshotBase64}`));
        lines.push("(screenshot image attached — analyze the visual content)");
      } else {
        lines.push(
          `Screenshot (Base64 PNG): data:image/png;base64,${result.screenshotBase64.slice(0, 64)}…`
        );
      }
    } else {
      lines.push("(screenshot capture unavailable — text summary only)");
    }

    return lines.join("\n");
  },
};
