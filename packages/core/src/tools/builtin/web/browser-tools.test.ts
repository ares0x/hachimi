import { describe, expect, it } from "vitest";
import { PathJail } from "../../../sandbox/path-jail.js";
import { browserClickTool } from "./browser-click.js";
import { browserEngine } from "./browser-engine.js";
import { browserNavigateTool } from "./browser-navigate.js";
import { browserSnapshotTool } from "./browser-snapshot.js";
import { browserTypeTool } from "./browser-type.js";
import { browserWaitTool } from "./browser-wait.js";

describe("Built-in Browser Tools Suite", () => {
  const jail = new PathJail({ workspaceRoot: process.cwd() });
  const ctx = { jail, sessionId: "test_session_browser" } as any;

  it("browserEngine manages headless configuration", () => {
    expect(browserEngine.getHeadless()).toBe(true);
    browserEngine.setHeadless(false);
    expect(browserEngine.getHeadless()).toBe(false);
    browserEngine.setHeadless(true);
    expect(browserEngine.getMode()).toBe("static-fetch");
  });

  it("browser_navigate fetches static HTML (no JS)", async () => {
    const res = await browserNavigateTool.execute({ url: "https://example.com" }, ctx);
    expect(res).toContain("Browser Navigated");
    expect(res).toContain("static-fetch");
  });

  it("browser_snapshot reports mode and empty-content hint for SPA pages", async () => {
    const res = await browserSnapshotTool.execute({ fullPage: false }, ctx);
    expect(res).toContain("Browser Page Snapshot");
    expect(res).toContain("URL:");
    expect(res).toContain("static-fetch");
  });

  it("browser_click is rejected honestly in static-fetch mode (no fake success)", async () => {
    const res = await browserClickTool.execute({ selector: "#submit-btn" }, ctx);
    expect(res).toContain("Browser Unsupported");
    expect(res).not.toContain("Success");
  });

  it("browser_type is rejected honestly in static-fetch mode", async () => {
    const res = await browserTypeTool.execute(
      { selector: "input[name='search']", text: "Hachimi Agent" },
      ctx
    );
    expect(res).toContain("Browser Unsupported");
  });

  it("browser_wait is rejected honestly in static-fetch mode", async () => {
    const res = await browserWaitTool.execute({ selector: ".results", timeoutMs: 1000 }, ctx);
    expect(res).toContain("Browser Unsupported");
  });
});
