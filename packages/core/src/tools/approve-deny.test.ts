// packages/core/src/tools/approve-deny.test.ts
// W2.2 单测：approve → 工具继续执行；deny → 返回 cancelled 结果
//
// 测试 ToolRegistry.execute() 的 approval 决策路径：
//   - confirm:true  → 工具执行并返回结果（approval_granted 语义）
//   - onToolApproval 返回 true  → 工具执行并返回结果
//   - onToolApproval 返回 false → 返回取消消息（approval_denied 语义）
//   - 无 confirm 且无 handler   → 返回取消消息（安全绝杀）

import { describe, expect, it, vi } from "vitest";
import { PermissionPolicy } from "./policy.js";
import { ToolRegistry } from "./registry.js";

// ────────────────────────────────────────────────────────────────────────────
// Fixture: needs_confirm 工具（需要审批才能运行）
// ────────────────────────────────────────────────────────────────────────────

function makeRegistry() {
  const registry = new ToolRegistry();
  const mark = { ran: false, result: "" };

  registry.register({
    name: "sensitive_op",
    description: "需要用户确认的敏感操作",
    permission: "needs_confirm",
    parameters: { type: "object", properties: {} },
    async execute() {
      mark.ran = true;
      mark.result = "sensitive_op_executed";
      return mark.result;
    },
  });

  return { registry, mark };
}

// telegram: allow-safe → needs_confirm → require_approval
const APPROVE_SURFACE = "telegram";

// ────────────────────────────────────────────────────────────────────────────
// 1. confirm:true（上游已显式审批） → 工具执行
// ────────────────────────────────────────────────────────────────────────────

describe("W2.2: approve → 工具继续执行", () => {
  it("confirm:true 直接放行，工具执行成功", async () => {
    const { registry, mark } = makeRegistry();

    const result = await registry.execute("sensitive_op", {}, {
      channel: APPROVE_SURFACE,
      confirm: true, // 上游（API SSE handler / HITL UI）已获得用户许可
    });

    expect(mark.ran).toBe(true);
    expect(result).toBe("sensitive_op_executed");
  });

  it("onToolApproval 返回 true → 工具执行成功", async () => {
    const { registry, mark } = makeRegistry();
    const approvalHandler = vi.fn().mockResolvedValue(true);

    const result = await registry.execute("sensitive_op", {}, {
      channel: APPROVE_SURFACE,
      onToolApproval: approvalHandler,
    });

    // handler 被询问
    expect(approvalHandler).toHaveBeenCalledWith("sensitive_op", {}, "needs_confirm");
    // 工具因审批通过而执行
    expect(mark.ran).toBe(true);
    expect(result).toBe("sensitive_op_executed");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. deny（手动拒绝或无 handler） → 返回取消消息，工具不执行
// ────────────────────────────────────────────────────────────────────────────

describe("W2.2: deny → 返回 cancelled 结果，工具不执行", () => {
  it("onToolApproval 返回 false → 返回取消消息", async () => {
    const { registry, mark } = makeRegistry();
    const approvalHandler = vi.fn().mockResolvedValue(false); // 用户拒绝

    const result = await registry.execute("sensitive_op", {}, {
      channel: APPROVE_SURFACE,
      onToolApproval: approvalHandler,
    });

    // 工具未执行
    expect(mark.ran).toBe(false);
    // 返回拒绝/取消消息（非工具执行结果）
    expect(result).toMatch(/需要确认|未经授权|拒绝|denied/i);
  });

  it("无 confirm 且无 onToolApproval → 安全绝杀，返回取消消息", async () => {
    const { registry, mark } = makeRegistry();

    const result = await registry.execute("sensitive_op", {}, {
      channel: APPROVE_SURFACE,
      // 不传 confirm，不传 onToolApproval
    });

    // 工具未执行
    expect(mark.ran).toBe(false);
    // 返回拒绝消息
    expect(result).toMatch(/需要确认|未经授权|拒绝|denied/i);
  });

  it("confirm:false 显式传入 → 不等同于批准，工具不执行", async () => {
    const { registry, mark } = makeRegistry();

    const result = await registry.execute("sensitive_op", {}, {
      channel: APPROVE_SURFACE,
      confirm: false, // 显式为 false
    });

    // Boolean(false) === false → 不批准
    expect(mark.ran).toBe(false);
    expect(result).toMatch(/需要确认|未经授权|拒绝|denied/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. safe 工具不需要审批（基准对比测试）
// ────────────────────────────────────────────────────────────────────────────

describe("W2.2: safe 工具绕过审批逻辑", () => {
  it("safe 工具在任何 surface 均无需 confirm 即执行", async () => {
    const registry = new ToolRegistry();
    const mark = { ran: false };

    registry.register({
      name: "read_status",
      description: "安全的只读操作",
      permission: "safe",
      parameters: { type: "object", properties: {} },
      async execute() {
        mark.ran = true;
        return "ok";
      },
    });

    const result = await registry.execute("read_status", {}, {
      channel: "telegram", // 即使是 allow-safe surface，safe 工具直接放行
    });

    expect(mark.ran).toBe(true);
    expect(result).toBe("ok");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. approval 事件在 HarnessRuntime 层的写入（仅验证 policy.decide 输出）
// ────────────────────────────────────────────────────────────────────────────

describe("W2.2: PermissionPolicy — approve/deny 判决", () => {
  it("policy.decide(telegram, sensitive_op, needs_confirm) === require_approval", () => {
    const policy = new PermissionPolicy();
    expect(policy.decide("telegram", "sensitive_op", "needs_confirm")).toBe("require_approval");
  });

  it("policy.decide(tui, sensitive_op, needs_confirm) === allow（TUI allow-all 直接放行）", () => {
    const policy = new PermissionPolicy();
    expect(policy.decide("tui", "sensitive_op", "needs_confirm")).toBe("allow");
  });
});
