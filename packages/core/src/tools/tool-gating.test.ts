import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "../types/index.js";
import { ToolRegistry } from "./registry.js";

function tool(
  name: string,
  group?: string,
  kind: ToolDefinition["kind"] = "other"
): ToolDefinition {
  return {
    name,
    kind,
    ...(group ? { group } : {}),
    description: `tool ${name}`,
    permission: "safe",
    parameters: { type: "object", properties: {} },
    execute: async () => `result:${name}`,
  };
}

function buildRegistry() {
  const registry = new ToolRegistry();
  registry.register(tool("read_file"));
  registry.register(tool("run_command", undefined, "shell"));
  registry.register(tool("browser_navigate", "browser", "read"));
  registry.register(tool("browser_click", "browser", "write"));
  registry.register(tool("web_search", "search", "read"));
  registry.register(tool("git_status", "git", "read"));
  return registry;
}

describe("ToolRegistry tool gating (P2-B3)", () => {
  it("lists all tools when gating is disabled (default)", () => {
    const registry = buildRegistry();
    expect(
      registry
        .list()
        .map((t) => t.name)
        .sort()
    ).toEqual([
      "browser_click",
      "browser_navigate",
      "git_status",
      "read_file",
      "run_command",
      "web_search",
    ]);
    expect(registry.isToolGatingEnabled()).toBe(false);
  });

  it("advertises only ungrouped tools plus activated groups when gating is on", () => {
    const registry = buildRegistry();
    registry.setToolGating(true);
    expect(
      registry
        .list()
        .map((t) => t.name)
        .sort()
    ).toEqual(["read_file", "run_command"]);
    expect(registry.getActivatedGroups()).toEqual([]);
  });

  it("activates a group and returns newly exposed tool names", () => {
    const registry = buildRegistry();
    registry.setToolGating(true);
    const loaded = registry.loadToolGroup("browser");
    expect(loaded.sort()).toEqual(["browser_click", "browser_navigate"]);
    expect(
      registry
        .list()
        .map((t) => t.name)
        .sort()
    ).toEqual(["browser_click", "browser_navigate", "read_file", "run_command"]);
    // idempotent reload exposes nothing new
    expect(registry.loadToolGroup("browser")).toEqual([]);
    // unknown group is a no-op
    expect(registry.loadToolGroup("nope")).toEqual([]);
  });

  it("pre-activates default groups from config", () => {
    const registry = buildRegistry();
    registry.setToolGating(true, ["git", "search"]);
    expect(registry.getActivatedGroups().sort()).toEqual(["git", "search"]);
    expect(
      registry
        .list()
        .map((t) => t.name)
        .sort()
    ).toEqual(["git_status", "read_file", "run_command", "web_search"]);
  });

  it("lists the group catalog with activation state", () => {
    const registry = buildRegistry();
    registry.setToolGating(true, ["browser"]);
    const groups = registry.listGroups();
    const browser = groups.find((g) => g.name === "browser")!;
    expect(browser.tools.sort()).toEqual(["browser_click", "browser_navigate"]);
    expect(browser.activated).toBe(true);
    expect(groups.find((g) => g.name === "search")!.activated).toBe(false);
  });

  it("rejects execution of tools in inactive groups", async () => {
    const registry = buildRegistry();
    registry.setToolGating(true);
    const result = await registry.execute("browser_navigate", { url: "https://x.dev" });
    expect(result).toContain("未激活的工具组");
    expect(result).toContain("load_tools");

    registry.loadToolGroup("browser");
    const ok = await registry.execute("browser_navigate", { url: "https://x.dev" });
    expect(ok).toBe("result:browser_navigate");
  });
});
