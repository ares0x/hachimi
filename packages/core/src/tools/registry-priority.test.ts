// packages/core/src/tools/registry-priority.test.ts
//
// P1.5: 工具注册层级（builtin > extension > mcp）
// - 低优先级层不能覆盖高优先级层（MCP 不能遮蔽内置工具）
// - 同层可覆盖（刷新）；高层可升级低层的同名工具
// - 低优先级层不能注销高优先级层
import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "../types/index.js";
import { ToolRegistry } from "./registry.js";

function tool(name: string, description = `tool ${name}`): ToolDefinition {
  return {
    name,
    description,
    permission: "safe",
    parameters: { type: "object", properties: {} },
    execute: async () => `result:${name}`,
  };
}

describe("P1.5 builtin-priority tool registration", () => {
  it("builtin wins over mcp / extension regardless of registration order", () => {
    const registry = new ToolRegistry();

    // MCP 先注册（模拟 sync 提前），内置后注册 → 内置覆盖
    registry.register(tool("read_file", "mcp version"), "mcp");
    expect(registry.get("read_file")?.description).toBe("mcp version");
    registry.register(tool("read_file", "builtin version"), "builtin");
    expect(registry.get("read_file")?.description).toBe("builtin version");
    expect(registry.getLayer("read_file")).toBe("builtin");

    // 内置已注册后，MCP 再尝试覆盖 → 被拒绝
    const before = registry.get("read_file");
    registry.register(tool("read_file", "mcp override"), "mcp");
    expect(registry.get("read_file")).toBe(before);
    expect(registry.getLayer("read_file")).toBe("builtin");
  });

  it("extension cannot shadow builtin but can be upgraded by builtin", () => {
    const registry = new ToolRegistry();
    registry.register(tool("save_memory", "builtin version"), "builtin");

    registry.register(tool("save_memory", "extension attempt"), "extension");
    expect(registry.get("save_memory")?.description).toBe("builtin version");
    expect(registry.getLayer("save_memory")).toBe("builtin");

    // 同层刷新允许
    registry.register(tool("save_memory", "builtin refreshed"), "builtin");
    expect(registry.get("save_memory")?.description).toBe("builtin refreshed");
  });

  it("mcp layer unregister cannot remove a higher-priority tool", () => {
    const registry = new ToolRegistry();
    registry.register(tool("read_file"), "builtin");

    registry.unregister("read_file", "mcp");
    expect(registry.get("read_file")).toBeDefined();

    // 同层注销有效
    registry.register(tool("mcp_fetch_echo"), "mcp");
    registry.unregister("mcp_fetch_echo", "mcp");
    expect(registry.get("mcp_fetch_echo")).toBeUndefined();
  });

  it("default layer is extension and list() reflects registered tools", () => {
    const registry = new ToolRegistry();
    registry.register(tool("foo"));
    expect(registry.getLayer("foo")).toBe("extension");
    expect(registry.list().map((t) => t.name)).toContain("foo");
  });
});
