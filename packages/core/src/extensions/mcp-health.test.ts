// packages/core/src/extensions/mcp-health.test.ts
//
// P0.2 MCP 健康跟踪与自动恢复：
// - 连续失败 → 降级（degraded）→ 工具从 manifest 隐藏
// - 退避窗口到期后自动重建传输并恢复健康
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { McpClientManager } from "./mcp-client.js";
import type { IMcpTransport, McpToolDefinition } from "./mcp-types.js";

const FAKE_MCP_SERVER = `
const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fake", version: "1.0" } } }) + "\\n");
  } else if (msg.method === "notifications/initialized") {
  } else if (msg.method === "tools/list") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "safe_echo", description: "Echo", inputSchema: { type: "object", properties: { text: { type: "string" } } } }] } }) + "\\n");
  } else if (msg.method === "tools/call") {
    const text = (msg.params.arguments && msg.params.arguments.text) || "";
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "echo:" + text }] } }) + "\\n");
  }
});
`;

/** 总是失败的传输层，用于模拟 MCP server 崩溃 */
class FlakyTransport implements IMcpTransport {
  readonly version = "2024-11-05" as const;
  closeCalls = 0;
  async listTools(): Promise<McpToolDefinition[]> {
    throw new Error("connection refused");
  }
  async callTool(): Promise<string> {
    throw new Error("connection refused");
  }
  async close(): Promise<void> {
    this.closeCalls++;
  }
}

const TOOL_DEF: McpToolDefinition = {
  name: "safe_echo",
  description: "Echo text",
  inputSchema: { type: "object", properties: { text: { type: "string" } } },
};

describe("P0.2 MCP health tracking & auto-recovery", () => {
  it("degrades after consecutive failures and hides tools from manifest", async () => {
    const manager = new McpClientManager();
    const flaky = new FlakyTransport();
    const def = manager.registerMcpTool("flaky", TOOL_DEF, async () => "ok", {
      transport: flaky,
    });

    expect((await manager.list()).some((t) => t.name === "mcp_flaky_safe_echo")).toBe(true);

    // 前两次失败：记录连续失败
    const r1 = await def.execute({ text: "hi" });
    expect(r1).toContain("[MCP Stdio Error]");
    expect(manager.getServerHealth("flaky")?.degraded).toBe(false);

    const r2 = await def.execute({ text: "hi" });
    expect(r2).toContain("[MCP Stdio Error]");
    // 第二次失败后达到阈值 → degraded
    expect(manager.getServerHealth("flaky")?.degraded).toBe(true);
    expect(manager.getServerHealth("flaky")?.consecutiveFailures).toBe(2);
    expect(manager.getServerHealth("flaky")?.nextRestartAt).toBeDefined();

    // degraded 后工具从 manifest 隐藏（模型不再公布失效工具）
    expect((await manager.list()).some((t) => t.name === "mcp_flaky_safe_echo")).toBe(false);

    // 退避窗口未到 → 调用返回降级提示
    const r3 = await def.execute({ text: "hi" });
    expect(r3).toContain("降级状态");
  });

  it("auto-recovers after the backoff window and re-advertises tools", async () => {
    const manager = new McpClientManager();
    manager.registerServer("recoverable", {
      id: "recoverable",
      command: process.execPath,
      args: ["-e", FAKE_MCP_SERVER],
    });
    const registry = new ToolRegistry();
    await manager.syncTools(registry); // 设置 registryRef + 注册真实工具
    expect(registry.get("mcp_recoverable_safe_echo")).toBeDefined();

    // 模拟崩溃：用失败的传输层注册同名工具（工具定义保留，但调用走 flaky）
    const flaky = new FlakyTransport();
    const failing = manager.registerMcpTool("recoverable", TOOL_DEF, async () => "ok", {
      transport: flaky,
    });
    await failing.execute({ text: "a" });
    await failing.execute({ text: "b" });
    expect(manager.getServerHealth("recoverable")?.degraded).toBe(true);

    // 把退避窗口拨到过去，触发自动恢复（重建真实传输 + 重新注册）
    const health = manager.getServerHealth("recoverable");
    if (health) health.nextRestartAt = Date.now() - 1;

    const r = await failing.execute({ text: "hi" });
    expect(r).toBe("echo:hi"); // 恢复后由新传输成功执行
    expect(manager.getServerHealth("recoverable")?.degraded).toBe(false);
    expect(manager.getServerHealth("recoverable")?.consecutiveFailures).toBe(0);
  });
});
