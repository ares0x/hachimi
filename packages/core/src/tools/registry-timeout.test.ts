// P2.8 单测：per-tool timeoutMs 覆盖 + 超时中止传播 + 长耗时恢复提示
//
// 背景：delegate_subagent 等嵌套执行类工具一次真实运行（LLM 多轮 + 工具链）
// 远超通用 30s 沙箱上限。此前同步派发会被 30s 超时误杀，而底层嵌套 run 因
// Promise.race 不会中止，成为孤儿继续空耗 token。
//
// 本测试覆盖：
//   - tool.timeoutMs 覆盖全局默认 30s
//   - 超时后该工具调用自己的 ctx.signal 被 abort（嵌套执行真正中止）
//   - 长耗时工具（显式 timeoutMs）超时结果附恢复指引（agent_list 查询路径）

import { describe, expect, it } from "vitest";
import { ToolRegistry } from "./registry.js";

describe("P2.8: per-tool timeout override + abort propagation", () => {
  it("honors tool.timeoutMs instead of the global 30s default", async () => {
    const registry = new ToolRegistry();
    let executed = false;

    registry.register({
      name: "slow_tool",
      description: "slow test tool",
      permission: "safe",
      timeoutMs: 50,
      parameters: { type: "object", properties: {} },
      async execute() {
        executed = true;
        await new Promise((res) => setTimeout(res, 300));
        return "done";
      },
    });

    const result = await registry.execute("slow_tool", {});

    expect(executed).toBe(true);
    expect(result).toMatch(/\[(Sandbox Timeout|沙箱熔断)/);
  });

  it("aborts the tool's own ctx.signal when the sandbox timeout fires", async () => {
    const registry = new ToolRegistry();
    let capturedSignal: AbortSignal | undefined;

    registry.register({
      name: "slow_tool",
      description: "slow test tool",
      permission: "safe",
      timeoutMs: 50,
      parameters: { type: "object", properties: {} },
      async execute(_args, ctx) {
        capturedSignal = ctx?.signal;
        await new Promise((res) => setTimeout(res, 300));
        return "done";
      },
    });

    await registry.execute("slow_tool", {});

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("appends a recovery hint when a long-running tool times out", async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "long_running",
      description: "long-running orchestration test tool",
      permission: "safe",
      timeoutMs: 50,
      parameters: { type: "object", properties: {} },
      async execute() {
        await new Promise((res) => setTimeout(res, 300));
        return "done";
      },
    });

    const result = await registry.execute("long_running", {});

    expect(result).toMatch(/\[(Sandbox Timeout|沙箱熔断)/);
    expect(result).toContain("agent_list");
  });

  it("keeps normal fast tools working without a timeout override", async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "fast_tool",
      description: "fast test tool",
      permission: "safe",
      parameters: { type: "object", properties: {} },
      async execute() {
        return "fast_result";
      },
    });

    const result = await registry.execute("fast_tool", {});
    expect(result).toBe("fast_result");
  });
});
