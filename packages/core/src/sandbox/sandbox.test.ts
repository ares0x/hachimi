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

    expect(result).toContain("[沙箱熔断] 工具 slow_tool 执行超时 (50ms)");
  });

  it("truncates output when result exceeds maxBuffer cap", async () => {
    const sandbox = new ToolSandbox({ maxBuffer: 20 });
    const longOutput = "A".repeat(100);
    const result = await sandbox.executeToolInSandbox("verbose_tool", async () => longOutput);

    expect(result).toContain("AAAAAAAAAAAAAAAAAAAA");
    expect(result).toContain("[沙箱提示] 工具 verbose_tool 输出内容过长，已被自动截断");
  });
});
