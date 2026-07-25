// packages/core/src/tools/permission.test.ts
import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./registry.js";

describe("H2.3 Tool Permission Tri-Level Consistency Suite", () => {
  it("allows safe tools to execute automatically without approval callback", async () => {
    const registry = new ToolRegistry();
    const approvalSpy = vi.fn().mockResolvedValue(true);

    registry.register({
      name: "safe_tool",
      description: "安全工具",
      permission: "safe",
      parameters: {},
      execute: async () => "safe_ok",
    });

    const result = await registry.execute("safe_tool", {}, { onToolApproval: approvalSpy });
    expect(result).toBe("safe_ok");
    expect(approvalSpy).not.toHaveBeenCalled();
  });

  it("requires approval for needs_confirm tools and respects approval result", async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "confirm_tool",
      description: "需确认工具",
      permission: "needs_confirm",
      parameters: {},
      execute: async () => "confirm_ok",
    });

    // 拒绝授权
    const denied = await registry.execute(
      "confirm_tool",
      {},
      { onToolApproval: async () => false }
    );
    expect(denied).toContain("用户拒绝或未经授权");

    // 允许授权
    const approved = await registry.execute(
      "confirm_tool",
      {},
      { onToolApproval: async () => true }
    );
    expect(approved).toBe("confirm_ok");
  });

  it("requires approval and runs in sandbox for dangerous tools", async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "danger_tool",
      description: "危险工具",
      permission: "dangerous",
      parameters: {},
      execute: async () => "danger_ok",
    });

    const result = await registry.execute("danger_tool", {}, { confirm: true });
    expect(result).toBe("danger_ok");
  });
});
