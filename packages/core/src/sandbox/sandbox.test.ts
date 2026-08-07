// packages/core/src/sandbox/sandbox.test.ts
import { describe, expect, it } from "vitest";
import { ToolSandbox } from "./sandbox.js";

describe("ToolSandbox Minimum Tool Execution Sandbox", () => {
  it("executes safe tool normally in sandbox", async () => {
    const sandbox = new ToolSandbox();
    const result = await sandbox.executeToolInSandbox("test_tool", async () => "success_result");
    expect(result).toBe("success_result");
  });

  it("intercepts timeout when tool execution exceeds timeoutMs", async () => {
    const sandbox = new ToolSandbox({ timeoutMs: 50 });
    const result = await sandbox.executeToolInSandbox("slow_tool", async () => {
      await new Promise((res) => setTimeout(res, 200));
      return "done";
    });

    expect(result).toMatch(/\[(沙箱熔断|Sandbox Error|Sandbox Timeout)\]/);
  });

  it("invokes onTimeout callback when tool execution exceeds timeoutMs", async () => {
    const sandbox = new ToolSandbox({ timeoutMs: 50 });
    let timedOut = false;
    await sandbox.executeToolInSandbox(
      "slow_tool",
      async () => {
        await new Promise((res) => setTimeout(res, 200));
        return "done";
      },
      { onTimeout: () => (timedOut = true) }
    );

    expect(timedOut).toBe(true);
  });

  it("truncates output when result exceeds maxBuffer cap", async () => {
    const sandbox = new ToolSandbox({ maxBuffer: 20 });
    const longOutput = "A".repeat(100);
    const result = await sandbox.executeToolInSandbox("verbose_tool", async () => longOutput);

    expect(result).toContain("AAAAAAAAAAAAAAAAAAAA");
    expect(result).toMatch(/\[(沙箱提示|Sandbox Info)\]/);
  });
});
