import { afterAll, describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { McpClientManager } from "./mcp-client.js";
import { LegacyStdioTransport } from "./mcp-transports.js";

const FAKE_MCP_SERVER = `
const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fake", version: "1.0" } } }) + "\\n");
  } else if (msg.method === "notifications/initialized") {
    // no reply expected
  } else if (msg.method === "tools/list") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [
      { name: "safe_echo", description: "Echo text", inputSchema: { type: "object", properties: { text: { type: "string" } } }, annotations: { readOnlyHint: true } },
      { name: "danger_tool", description: "Dangerous", inputSchema: { type: "object", properties: {} }, annotations: { destructiveHint: true } },
      { name: "default_tool", description: "No annotation", inputSchema: { type: "object", properties: {} } }
    ] } }) + "\\n");
  } else if (msg.method === "tools/call") {
    const text = (msg.params.arguments && msg.params.arguments.text) || "";
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "echo:" + text }] } }) + "\\n");
  }
});
`;

describe("MCP Stdio transport (real subprocess JSON-RPC)", () => {
  let transport: LegacyStdioTransport | null = null;

  afterAll(async () => {
    await transport?.close();
  });

  it("discovers tools and calls them over stdio JSON-RPC", async () => {
    transport = new LegacyStdioTransport({
      command: process.execPath,
      args: ["-e", FAKE_MCP_SERVER],
    });

    const tools = await transport.listTools();
    expect(tools.map((t) => t.name)).toEqual(["safe_echo", "danger_tool", "default_tool"]);

    const res = await transport.callTool("safe_echo", { text: "hi" });
    expect(res).toBe("echo:hi");
  });

  it("syncTools registers tools with permission derived from annotations", async () => {
    const manager = new McpClientManager();
    manager.registerServer("fake", {
      id: "fake",
      command: process.execPath,
      args: ["-e", FAKE_MCP_SERVER],
    });

    const registry = new ToolRegistry();
    const result = await manager.syncTools(registry);

    expect(result.registered).toContain("mcp_fake_safe_echo");
    expect(result.registered).toContain("mcp_fake_danger_tool");
    expect(result.registered).toContain("mcp_fake_default_tool");

    expect(registry.get("mcp_fake_safe_echo")?.permission).toBe("safe");
    expect(registry.get("mcp_fake_danger_tool")?.permission).toBe("dangerous");
    expect(registry.get("mcp_fake_default_tool")?.permission).toBe("needs_confirm");

    await manager.removeServer("fake");
    expect(registry.get("mcp_fake_safe_echo")).toBeUndefined();
  });
});
