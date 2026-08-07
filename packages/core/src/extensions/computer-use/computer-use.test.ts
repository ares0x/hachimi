// packages/core/src/extensions/computer-use/computer-use.test.ts
import { describe, expect, it } from "vitest";
import { PathJail } from "../../sandbox/path-jail.js";
import { computerClickTool } from "./computer-click.js";
import { computerEngine } from "./computer-engine.js";
import { computerScreenshotTool } from "./computer-screenshot.js";
import { computerTypeTool } from "./computer-type.js";
import { registerComputerUseTools } from "./index.js";

describe("Computer Use Extension", () => {
  const jail = new PathJail({ workspaceRoot: process.cwd() });
  const ctx = { jail, sessionId: "test_computer_use" } as any;

  it("computerEngine is a singleton", () => {
    const a = computerEngine;
    const b = computerEngine;
    expect(a).toBe(b);
  });

  it("computer_screenshot returns platform and dimensions", async () => {
    const res = await computerScreenshotTool.execute({}, ctx);
    expect(res).toContain("Computer Screenshot");
    expect(res).toContain("Platform:");
    expect(res).toContain("Resolution:");
  });

  it("computer_click simulates click at coordinates", async () => {
    const res = await computerClickTool.execute({ x: 100, y: 200 }, ctx);
    expect(res).toContain("Computer Click");
    expect(res).toContain("100");
    expect(res).toContain("200");
  });

  it("computer_click rejects non-numeric coordinates", async () => {
    const res = await computerClickTool.execute({ x: "bad", y: "bad" }, ctx);
    expect(res).toContain("[Error]");
  });

  it("computer_type simulates text input", async () => {
    const res = await computerTypeTool.execute({ text: "Hello Hachimi!" }, ctx);
    expect(res).toContain("Computer Type");
  });

  it("computer_type supports key combos", async () => {
    const res = await computerTypeTool.execute({ keys: ["cmd", "c"] }, ctx);
    expect(res).toContain("Computer Type");
  });

  it("computer_type fails with no text or keys", async () => {
    const res = await computerTypeTool.execute({}, ctx);
    expect(res).toContain("[Error]");
  });

  it("registerComputerUseTools registers 3 tools", () => {
    const registered: string[] = [];
    const mockRegistry = {
      register: (t: { name: string }) => registered.push(t.name),
    } as any;
    registerComputerUseTools(mockRegistry);
    expect(registered).toContain("computer_screenshot");
    expect(registered).toContain("computer_click");
    expect(registered).toContain("computer_type");
    expect(registered).toHaveLength(3);
  });
});
