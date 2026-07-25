// packages/core/src/tools/circuit-breaker.test.ts
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "./registry.js";

describe("H2.5 Tool Circuit Breaker & Failure Isolation Suite", () => {
  it("trips circuit breaker after N consecutive failures and blocks further calls", async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "broken_tool",
      description: "易崩坏工具",
      permission: "safe",
      parameters: {},
      execute: async () => {
        throw new Error("数据库连接断开");
      },
    });

    // 前 3 次失败
    const res1 = await registry.execute("broken_tool", {});
    expect(res1).toContain("[沙箱拦截]");
    expect(registry.getFailureCount("broken_tool")).toBe(1);

    const res2 = await registry.execute("broken_tool", {});
    expect(registry.getFailureCount("broken_tool")).toBe(2);

    const res3 = await registry.execute("broken_tool", {});
    expect(registry.getFailureCount("broken_tool")).toBe(3);

    // 第 4 次触发 Circuit Breaker 自动熔断
    const res4 = await registry.execute("broken_tool", {});
    expect(res4).toContain("[工具熔断]");
    expect(res4).toContain("已连续失败 3 次");
  });

  it("resets failure counter upon successful execution", async () => {
    const registry = new ToolRegistry();
    let shouldFail = true;

    registry.register({
      name: "flaky_tool",
      description: "不稳定工具",
      permission: "safe",
      parameters: {},
      execute: async () => {
        if (shouldFail) throw new Error("临时失败");
        return "成功恢复";
      },
    });

    await registry.execute("flaky_tool", {});
    expect(registry.getFailureCount("flaky_tool")).toBe(1);

    shouldFail = false;
    const okRes = await registry.execute("flaky_tool", {});
    expect(okRes).toBe("成功恢复");
    expect(registry.getFailureCount("flaky_tool")).toBe(0);
  });
});
