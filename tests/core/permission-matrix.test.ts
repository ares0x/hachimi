// tests/core/permission-matrix.test.ts
import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";

describe("P0 Permission Matrix Test Suite (TUI / Daemon / Telegram x safe / needs_confirm / dangerous)", () => {
  const createTestRegistry = () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "tool_safe",
      description: "安全工具",
      permission: "safe",
      parameters: {},
      execute: async () => "result_safe",
    });
    registry.register({
      name: "tool_confirm",
      description: "需确认工具",
      permission: "needs_confirm",
      parameters: {},
      execute: async () => "result_confirm",
    });
    registry.register({
      name: "tool_dangerous",
      description: "危险工具",
      permission: "dangerous",
      parameters: {},
      execute: async () => "result_dangerous",
    });
    return registry;
  };

  it("1. TUI Channel: Automatically approves safe, prompts interactive approval for needs_confirm & dangerous", async () => {
    const registry = createTestRegistry();
    const tuiApproval = vi.fn().mockImplementation(async (name: string) => name === "tool_confirm");

    // safe
    const resSafe = await registry.execute("tool_safe", {}, { onToolApproval: tuiApproval });
    expect(resSafe).toBe("result_safe");
    expect(tuiApproval).not.toHaveBeenCalled();

    // needs_confirm (approved)
    const resConfirm = await registry.execute("tool_confirm", {}, { onToolApproval: tuiApproval });
    expect(resConfirm).toBe("result_confirm");
    expect(tuiApproval).toHaveBeenCalledWith("tool_confirm", {}, "needs_confirm", undefined, {
      channel: "api",
      trustLevel: undefined,
      toolKind: undefined,
    });

    // dangerous (denied)
    const resDangerous = await registry.execute(
      "tool_dangerous",
      {},
      { onToolApproval: tuiApproval }
    );
    expect(resDangerous).toContain("用户拒绝或未经授权");
  });

  it("2. Daemon API Channel: Safe passes automatically, needs_confirm & dangerous check Bearer token / Policy", async () => {
    const registry = createTestRegistry();

    // 默认 Policy 模拟：系统未授权危险工具
    const apiPolicyEngine = async (_name: string, _args: any, permission: string) => {
      return permission !== "dangerous";
    };

    const resSafe = await registry.execute("tool_safe", {}, { onToolApproval: apiPolicyEngine });
    expect(resSafe).toBe("result_safe");

    const resConfirm = await registry.execute(
      "tool_confirm",
      {},
      { onToolApproval: apiPolicyEngine }
    );
    expect(resConfirm).toBe("result_confirm");

    const resDangerous = await registry.execute(
      "tool_dangerous",
      {},
      { onToolApproval: apiPolicyEngine }
    );
    expect(resDangerous).toContain("用户拒绝或未经授权");
  });

  it("3. Telegram Gateway Channel: White-listed admin users get confirmed execution via pipeline", async () => {
    const registry = createTestRegistry();

    // 模拟 Telegram 白名单用户确认逻辑 (Policy Engine)
    const telegramAdminUser = 866448423;
    const currentTelegramUser = 866448423;
    const allowedUsers = [telegramAdminUser];

    const telegramPolicy = async () => {
      return allowedUsers.includes(currentTelegramUser);
    };

    const resConfirm = await registry.execute(
      "tool_confirm",
      {},
      { onToolApproval: telegramPolicy }
    );
    expect(resConfirm).toBe("result_confirm");

    const resDangerous = await registry.execute(
      "tool_dangerous",
      {},
      { onToolApproval: telegramPolicy }
    );
    expect(resDangerous).toBe("result_dangerous");
  });
});
