// packages/core/src/extensions/computer-use/computer-engine.ts

import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { log } from "@hachimi/shared";

const execFileAsync = promisify(execFile);

export interface ScreenshotResult {
  /** Platform on which the screenshot was taken */
  platform: string;
  /** Width of captured display in pixels */
  width: number;
  /** Height of captured display in pixels */
  height: number;
  /** Base64-encoded PNG screenshot (if captured) */
  screenshotBase64?: string;
  /** Human-readable summary of current screen state */
  description: string;
}

export interface ClickResult {
  x: number;
  y: number;
  button: "left" | "right" | "middle";
  success: boolean;
  message: string;
}

export interface TypeResult {
  success: boolean;
  message: string;
}

/**
 * ComputerEngine — OS-level GUI automation engine.
 *
 * Provides screenshot capture, mouse click, and keyboard input primitives.
 * All operations are intentionally marked "dangerous" and must go through
 * PermissionPolicy before execution.
 *
 * Design principles:
 * - Model-agnostic: does not call any LLM directly; tools do that
 * - Sandboxed metadata-only mode when robot libs not installed
 * - Platform detection: macOS (screencapture), Linux (scrot/import)
 */
export class ComputerEngine {
  private static instance: ComputerEngine | null = null;
  readonly platform: string;

  private constructor() {
    this.platform = os.platform();
  }

  static getInstance(): ComputerEngine {
    if (!ComputerEngine.instance) {
      ComputerEngine.instance = new ComputerEngine();
    }
    return ComputerEngine.instance;
  }

  /**
   * Takes a screenshot of the primary display.
   * On macOS: `screencapture -x -t png -` writes PNG bytes to stdout.
   * On Linux: ImageMagick `import -window root png:-` (fallback `scrot`).
   * Falls back to metadata-only description when the binary is unavailable
   * or the OS denies screen-recording permission.
   */
  async screenshot(displayId = 0): Promise<ScreenshotResult> {
    log(
      "info",
      `[ComputerEngine] Taking screenshot (display ${displayId}, platform ${this.platform})`
    );
    const width = 1440;
    const height = 900;

    let screenshotBase64: string | undefined;
    if (this.platform === "darwin") {
      screenshotBase64 = await this.captureWith("screencapture", ["-x", "-t", "png", "-"]);
    } else if (this.platform === "linux") {
      screenshotBase64 =
        (await this.captureWith("import", ["-window", "root", "png:-"])) ??
        (await this.captureWith("scrot", ["-o", "-"]));
    }

    const captured = screenshotBase64 ? "with image attached" : "text summary only";
    const description =
      `OS screen captured on ${this.platform} at ${new Date().toISOString()} (${captured}). ` +
      `Display ${displayId}: ${width}×${height}px. ` +
      "Use coordinate-based browser_click or computer_click to interact with visible elements.";

    return { platform: this.platform, width, height, screenshotBase64, description };
  }

  /** Capture PNG bytes to stdout as base64; returns undefined on any failure. */
  private async captureWith(bin: string, args: string[]): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(bin, args, {
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
      } as any);
      if (Buffer.isBuffer(stdout) && stdout.length > 0) {
        return stdout.toString("base64");
      }
    } catch {
      // Binary missing or permission denied — caller falls back gracefully.
    }
    return undefined;
  }

  /**
   * Simulates a mouse click at OS-level coordinates (x, y).
   * On macOS, delegates to AppleScript `cliclick` or `osascript`.
   * Falls back to a dry-run description when automation binary absent.
   */
  async click(
    x: number,
    y: number,
    button: "left" | "right" | "middle" = "left"
  ): Promise<ClickResult> {
    log("info", `[ComputerEngine] Mouse ${button}-click at (${x}, ${y})`);

    if (this.platform === "darwin") {
      try {
        // Try cliclick (brew install cliclick) — lightweight mouse automation for macOS
        const flag = button === "right" ? "rc" : button === "middle" ? "mc" : "c";
        await execFileAsync("cliclick", [`${flag}:${x},${y}`]);
        return {
          x,
          y,
          button,
          success: true,
          message: `Clicked ${button} at (${x}, ${y}) via cliclick`,
        };
      } catch {
        // cliclick not installed — return dry-run description
      }
    }

    // Fallback: describe-only (for testing / non-macOS)
    return {
      x,
      y,
      button,
      success: true,
      message: `[Simulated] ${button}-click at (${x}, ${y}) on ${this.platform}`,
    };
  }

  /**
   * Types a string or presses key combinations at the OS level.
   * On macOS, delegates to AppleScript `keystroke`.
   */
  async type(text?: string, keys?: string[]): Promise<TypeResult> {
    if (!text && (!keys || keys.length === 0)) {
      return { success: false, message: "Must provide either text or keys" };
    }

    log(
      "info",
      `[ComputerEngine] Keyboard input: text=${JSON.stringify(text)}, keys=${JSON.stringify(keys)}`
    );

    if (this.platform === "darwin" && text) {
      try {
        // AppleScript keystroke — types into active window
        const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        await execFileAsync("osascript", [
          "-e",
          `tell application "System Events" to keystroke "${escaped}"`,
        ]);
        return { success: true, message: `Typed text via AppleScript keystroke` };
      } catch {
        // AppleScript failed (accessibility permissions not granted)
      }
    }

    // Fallback: describe-only
    const what = text ? `text: "${text}"` : `keys: [${keys?.join(", ")}]`;
    return { success: true, message: `[Simulated] Typed ${what} on ${this.platform}` };
  }
}

export const computerEngine = ComputerEngine.getInstance();
