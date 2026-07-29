// packages/core/src/tools/channel-policy.test.ts
//
// 验证 PermissionPolicy 矩阵在不同 channel/surface 下对同一工具的裁决差异。
// 关键场景：write_file (needs_confirm)
//   - tui         → allow-all  → allow
//   - telegram    → allow-safe → require_approval
//   - web-sse     → allow-safe → require_approval
//   - cli         → allow-safe → require_approval
//   - api-json    → allow-safe → require_approval
//
// 以及 Agent.run 在不同 channel 下的端到端行为差异（TUI 工具实际运行 vs Telegram 需等待审批）。

import { join } from "node:path";
import { FileJsonStore } from "@hachimi/storage";
import { describe, expect, it, vi } from "vitest";
import { MemoryManager } from "../memory/manager.js";
import { PermissionPolicy } from "./policy.js";
import { ToolRegistry } from "./registry.js";
import { Agent } from "../agent/agent.js";
import { MockLLMProvider } from "../agent/llm.js";
import type { LLMProvider, LLMResponse, Message, ToolDefinition } from "../types/index.js";
import { generateId } from "@hachimi/shared";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeMemory() {
  return new MemoryManager(
    join(process.cwd(), "data-test-channel-policy.json"),
    new FileJsonStore()
  );
}

/** 模拟 write_file 类工具（needs_confirm，用于触发策略裁决） */
function registerWriteFileTool(registry: ToolRegistry, mark: { ran: boolean }) {
  registry.register({
    name: "write_file",
    description: "写文件（needs_confirm 权限，mock 实现，不实际写磁盘）",
    permission: "needs_confirm",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path"],
    },
    async execute() {
      mark.ran = true;
      return "file_written";
    },
  });
}

/** 模拟 LLM 始终调用 write_file */
class AlwaysWriteFileMock implements LLMProvider {
  private calls = 0;

  async chat(_messages: Message[], _tools: ToolDefinition[] = []): Promise<LLMResponse> {
    this.calls++;
    // 第一轮调用工具，后续返回普通文本（避免无限循环）
    if (this.calls === 1) {
      return {
        content: null,
        tool_calls: [
          {
            id: generateId("call_"),
            name: "write_file",
            arguments: { path: "test-output.txt", content: "hello" },
          },
        ],
      };
    }
    return { content: "任务完成" };
  }

  async chatStream(messages: Message[], tools: ToolDefinition[]): Promise<LLMResponse> {
    return this.chat(messages, tools);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. 纯 PermissionPolicy 矩阵单元测试（不涉及 Agent）
// ────────────────────────────────────────────────────────────────────────────

describe("PermissionPolicy.decide — channel 矩阵裁决", () => {
  const policy = new PermissionPolicy();

  it("tui: write_file(needs_confirm) → allow（allow-all 策略）", () => {
    expect(policy.decide("tui", "write_file", "needs_confirm")).toBe("allow");
  });

  it("telegram: write_file(needs_confirm) → require_approval（allow-safe 策略）", () => {
    expect(policy.decide("telegram", "write_file", "needs_confirm")).toBe("require_approval");
  });

  it("web-sse: write_file(needs_confirm) → require_approval（allow-safe 策略）", () => {
    expect(policy.decide("web-sse", "write_file", "needs_confirm")).toBe("require_approval");
  });

  it("cli: write_file(needs_confirm) → require_approval（allow-safe 策略）", () => {
    expect(policy.decide("cli", "write_file", "needs_confirm")).toBe("require_approval");
  });

  it("api-json: write_file(needs_confirm) → require_approval（allow-safe 策略）", () => {
    expect(policy.decide("api-json", "write_file", "needs_confirm")).toBe("require_approval");
  });

  it("任意 channel: calculator(safe) → allow（所有策略均放行 safe）", () => {
    for (const surface of ["tui", "telegram", "web-sse", "cli", "api-json", "desktop"] as const) {
      expect(policy.decide(surface, "calculator", "safe")).toBe("allow");
    }
  });

  it("未传 channel/undefined channel → 默认使用 api（allow-safe 策略）", () => {
    expect(policy.decide(undefined as any, "write_file", "needs_confirm")).toBe("require_approval");
    expect(policy.decide(undefined as any, "calculator", "safe")).toBe("allow");
  });

  it("完整 surface × permission 矩阵测试", () => {
    const surfaces = ["tui", "web", "web-sse", "desktop", "telegram", "api", "api-json", "cli", "ws", "proactive-trigger", "system", "unknown"] as const;
    for (const s of surfaces) {
      // safe 工具全表面放行
      expect(policy.decide(s, "calc", "safe")).toBe("allow");
      // tui 放行 needs_confirm 与 dangerous (allow-all)
      if (s === "tui") {
        expect(policy.decide(s, "shell", "needs_confirm")).toBe("allow");
        expect(policy.decide(s, "shell", "dangerous")).toBe("allow");
      } else {
        // 其余表面 allow-safe 策略：needs_confirm / dangerous 均要求 require_approval
        expect(policy.decide(s, "shell", "needs_confirm")).toBe("require_approval");
        expect(policy.decide(s, "shell", "dangerous")).toBe("require_approval");
      }
    }
  });

  it("allowlist 策略：白名单外工具 → deny", () => {
    const customPolicy = new PermissionPolicy({
      custom_surface: {
        policy: "allowlist",
        allowedTools: ["calculator"],
      },
    });
    expect(customPolicy.decide("custom_surface", "calculator", "safe")).toBe("allow");
    expect(customPolicy.decide("custom_surface", "write_file", "needs_confirm")).toBe("deny");
  });

  it("deny 策略：safe 工具也被拒绝", () => {
    const denyPolicy = new PermissionPolicy({
      sandbox_surface: { policy: "deny" },
    });
    expect(denyPolicy.decide("sandbox_surface", "calculator", "safe")).toBe("deny");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. 端到端：channel 影响 Agent 工具实际执行行为
// ────────────────────────────────────────────────────────────────────────────

describe("Agent + channel — 端到端裁决差异", () => {
  it("channel=tui: write_file 策略 allow，不触发 approvalHandler", async () => {
    const tools = new ToolRegistry();
    const mark = { ran: false };
    registerWriteFileTool(tools, mark);

    const agent = new Agent({
      llm: new AlwaysWriteFileMock(),
      tools,
      memory: makeMemory(),
      maxToolRounds: 5,
    });

    const approval = vi.fn().mockResolvedValue(true);
    await agent.run("写文件", [], {
      channel: "tui",
      onToolApproval: approval,
    });

    // tui allow-all → 不调用 approvalHandler，工具直接执行
    expect(approval).not.toHaveBeenCalled();
    expect(mark.ran).toBe(true);
  });

  it("channel=telegram: write_file 策略 require_approval，审批通过后执行", async () => {
    const tools = new ToolRegistry();
    const mark = { ran: false };
    registerWriteFileTool(tools, mark);

    const agent = new Agent({
      llm: new AlwaysWriteFileMock(),
      tools,
      memory: makeMemory(),
      maxToolRounds: 5,
    });

    const approval = vi.fn().mockResolvedValue(true); // 模拟用户点击「允许」
    await agent.run("写文件", [], {
      channel: "telegram",
      onToolApproval: approval,
    });

    // telegram allow-safe → needs_confirm 触发 require_approval → 调用 approvalHandler
    expect(approval).toHaveBeenCalledWith(
      "write_file",
      { path: "test-output.txt", content: "hello" },
      "needs_confirm"
    );
    expect(mark.ran).toBe(true);
  });

  it("channel=telegram: 审批被拒绝，工具不执行", async () => {
    const tools = new ToolRegistry();
    const mark = { ran: false };
    registerWriteFileTool(tools, mark);

    const agent = new Agent({
      llm: new AlwaysWriteFileMock(),
      tools,
      memory: makeMemory(),
      maxToolRounds: 5,
    });

    const approval = vi.fn().mockResolvedValue(false); // 模拟用户点击「拒绝」
    const reply = await agent.run("写文件", [], {
      channel: "telegram",
      onToolApproval: approval,
    });

    expect(mark.ran).toBe(false);
    // 审批回调被调用（最多 maxRejectionsPerTool=2 次后熔断）
    expect(approval).toHaveBeenCalled();
    // 注意：reply 是 LLM 最终文本响应，不是工具拒绝消息本身（后者在 tool result message 中）
  });

  it("channel=web-sse 无审批 handler: 工具不执行（安全绝杀）", async () => {
    const tools = new ToolRegistry();
    const mark = { ran: false };
    registerWriteFileTool(tools, mark);

    const agent = new Agent({
      llm: new AlwaysWriteFileMock(),
      tools,
      memory: makeMemory(),
      maxToolRounds: 5,
      // 无构造时 handler
    });

    await agent.run("写文件", [], {
      channel: "web-sse",
      // 无 per-call onToolApproval
    });

    // 无 handler → 安全默认拒绝执行
    expect(mark.ran).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. ToolRegistry.execute 直接调用时 channel 的裁决行为
// ────────────────────────────────────────────────────────────────────────────

describe("ToolRegistry.execute — channel 参数直接裁决", () => {
  it("tui channel: needs_confirm 工具直接放行", async () => {
    const registry = new ToolRegistry();
    const mark = { ran: false };
    registry.register({
      name: "risky_tool",
      description: "高风险操作",
      permission: "needs_confirm",
      parameters: { type: "object", properties: {} },
      async execute() {
        mark.ran = true;
        return "executed";
      },
    });

    const result = await registry.execute("risky_tool", {}, { channel: "tui" });

    expect(mark.ran).toBe(true);
    expect(result).toBe("executed");
  });

  it("telegram channel: needs_confirm 工具无 handler → 拒绝", async () => {
    const registry = new ToolRegistry();
    const mark = { ran: false };
    registry.register({
      name: "risky_tool",
      description: "高风险操作",
      permission: "needs_confirm",
      parameters: { type: "object", properties: {} },
      async execute() {
        mark.ran = true;
        return "executed";
      },
    });

    const result = await registry.execute("risky_tool", {}, {
      channel: "telegram",
      // 无 onToolApproval，无 confirm
    });

    expect(mark.ran).toBe(false);
    expect(result).toMatch(/需要确认|拒绝|未经授权/);
  });

  it("telegram channel + onToolApproval 拒绝: 工具不执行", async () => {
    const registry = new ToolRegistry();
    const mark = { ran: false };
    registry.register({
      name: "risky_tool",
      description: "高风险操作",
      permission: "needs_confirm",
      parameters: { type: "object", properties: {} },
      async execute() {
        mark.ran = true;
        return "executed";
      },
    });

    const result = await registry.execute("risky_tool", {}, {
      channel: "telegram",
      onToolApproval: async () => false,
    });

    expect(mark.ran).toBe(false);
    expect(result).toMatch(/需要确认|拒绝|未经授权/);
  });

  it("telegram channel + onToolApproval 放行: 工具执行", async () => {
    const registry = new ToolRegistry();
    const mark = { ran: false };
    registry.register({
      name: "risky_tool",
      description: "高风险操作",
      permission: "needs_confirm",
      parameters: { type: "object", properties: {} },
      async execute() {
        mark.ran = true;
        return "executed";
      },
    });

    const result = await registry.execute("risky_tool", {}, {
      channel: "telegram",
      onToolApproval: async () => true,
    });

    expect(mark.ran).toBe(true);
    expect(result).toBe("executed");
  });
});
