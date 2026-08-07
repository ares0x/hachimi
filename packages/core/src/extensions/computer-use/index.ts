// packages/core/src/extensions/computer-use/index.ts
/**
 * Computer Use Extension
 *
 * Optional OS-level GUI automation extension.
 * Register these tools only when the user explicitly enables Computer Use
 * in Settings → Extensions, to keep them isolated from the default tool set.
 *
 * All tools use "dangerous" permission tier and require explicit HITL confirmation.
 */
export { computerClickTool } from "./computer-click.js";
export type { ClickResult, ScreenshotResult, TypeResult } from "./computer-engine.js";
export { computerEngine } from "./computer-engine.js";
export { computerScreenshotTool } from "./computer-screenshot.js";
export { computerTypeTool } from "./computer-type.js";

import type { ToolRegistry } from "../../tools/registry.js";
import { computerClickTool } from "./computer-click.js";
import { computerScreenshotTool } from "./computer-screenshot.js";
import { computerTypeTool } from "./computer-type.js";

/**
 * Registers all Computer Use tools into the given ToolRegistry.
 * Call this only when the user has enabled the Computer Use extension.
 */
export function registerComputerUseTools(registry: ToolRegistry): void {
  registry.register(computerScreenshotTool);
  registry.register(computerClickTool);
  registry.register(computerTypeTool);
}
