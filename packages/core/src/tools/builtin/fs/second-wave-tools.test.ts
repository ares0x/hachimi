import { describe, expect, it } from "vitest";
import { PathJail } from "../../../sandbox/path-jail.js";
import { ToolRegistry } from "../../registry.js";
import { manageConfigTool } from "../meta/manage-config.js";
import { sleepTimerTool } from "../meta/sleep-timer.js";
import { toolSearchTool } from "../meta/tool-search.js";
import { lspQueryTool } from "./lsp-query.js";

describe("Second Wave Migrated Tools Suite", () => {
  const jail = new PathJail({ workspaceRoot: process.cwd() });
  const registry = new ToolRegistry();
  registry.register(toolSearchTool);
  registry.register(sleepTimerTool);

  const ctx = { jail, registry, sessionId: "test_session_456" } as any;

  it("tool_search finds registered tools by keyword query", async () => {
    const res = await toolSearchTool.execute({ query: "search" }, ctx);
    expect(res).toContain("Tool Search Matches");
    expect(res).toContain("tool_search");
  });

  it("sleep_timer executes controlled wait", async () => {
    const res = await sleepTimerTool.execute({ seconds: 1, reason: "Test sleep" }, ctx);
    expect(res).toContain("Sleep Timer Finished");
    expect(res).toContain("1.0s");
  });

  it("manage_config dumps runtime environment config", async () => {
    const res = await manageConfigTool.execute({ action: "list_all" }, ctx);
    expect(res).toContain("Harness Runtime Config Dump");
    expect(res).toContain("workspaceRoot");
  });

  it("lsp_query extracts document symbols from source file", async () => {
    const res = await lspQueryTool.execute(
      { path: "packages/core/src/index.ts", operation: "documentSymbol" },
      ctx
    );
    expect(res).toContain("LSP Document Symbols");
    expect(res).toContain("export");
  });
});
