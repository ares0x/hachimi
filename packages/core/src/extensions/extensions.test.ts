// packages/core/src/extensions/extensions.test.ts
import { describe, expect, it } from "vitest";
import { HookRegistry } from "./hooks.js";
import { McpClientManager } from "./mcp-client.js";
import { parseSkillMarkdown } from "./skill-package.js";

describe("Phase E Unified Extension Registry & Plugin System", () => {
  it("parseSkillMarkdown parses frontmatter and markdown body correctly", () => {
    const rawMarkdown = `---
name: my-custom-skill
description: 一个自愈排错技能
tags: [debug, custom]
---
# 技能说明
这是技能的实际 Prompt 内容。
`;

    const skill = parseSkillMarkdown(rawMarkdown, "fallback");
    expect(skill.name).toBe("my-custom-skill");
    expect(skill.description).toBe("一个自愈排错技能");
    expect(skill.tags).toContain("debug");
    const content = typeof skill.load === "function" ? skill.load() : skill.load;
    expect((content as any).prompt).toContain("# 技能说明");
  });

  it("HookRegistry intercepts and modifies pre/post tool calls", async () => {
    const hooks = new HookRegistry();

    // 注册前置 Hook：拦截危险参数
    hooks.onPreToolCall(async (ctx) => {
      if (ctx.args.cmd === "rm -rf /") {
        return { action: "block", reason: "危险指令禁止执行" };
      }
      return { action: "allow" };
    });

    // 1. 允许允许的调用
    const allowed = await hooks.runPreToolCall({
      toolName: "bash",
      args: { cmd: "ls" },
    });
    expect(allowed.action).toBe("allow");

    // 2. 拦截被禁止的调用
    const blocked = await hooks.runPreToolCall({
      toolName: "bash",
      args: { cmd: "rm -rf /" },
    });
    expect(blocked.action).toBe("block");
    expect(blocked.reason).toContain("危险指令");
  });

  it("McpClientManager registers and resolves MCP tools as CapabilitySource", async () => {
    const mcpManager = new McpClientManager();

    mcpManager.registerMcpTool(
      "fetch-server",
      {
        name: "fetch",
        description: "HTTP Fetch 工具",
        inputSchema: { type: "object", properties: { url: { type: "string" } } },
      },
      async (args) => `Fetched content from ${args.url}`
    );

    const tools = await mcpManager.list();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("mcp_fetch-server_fetch");

    const resolved = await mcpManager.resolve("mcp_fetch-server_fetch");
    expect(resolved).toBeDefined();
    const result = await resolved!.execute({ url: "https://example.com" });
    expect(result).toBe("Fetched content from https://example.com");
  });
});
