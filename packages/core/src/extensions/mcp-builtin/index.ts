import type { ToolRegistry } from "../../tools/registry.js";
import { fetchMcpTool } from "./fetch-mcp.js";
import { filesystemMcpTool } from "./filesystem-mcp.js";

export { fetchMcpTool } from "./fetch-mcp.js";
export { filesystemMcpTool } from "./filesystem-mcp.js";

/**
 * Register built-in MCP tools into ToolRegistry
 */
export function registerBuiltinMcpServers(tools: ToolRegistry): void {
  tools.register(
    {
      name: fetchMcpTool.name,
      description: fetchMcpTool.description || "Fetch web content",
      permission: "safe",
      parameters: fetchMcpTool.inputSchema || { type: "object", properties: {} },
      execute: async (args) => {
        const res = await fetchMcpTool.handler!(args);
        if (res.isError) {
          throw new Error(res.content[0]?.text || "MCP fetch error");
        }
        return res.content[0]?.text || "";
      },
    },
    "builtin"
  );

  tools.register(
    {
      name: filesystemMcpTool.name,
      description: filesystemMcpTool.description || "Filesystem path jail reader",
      permission: "safe",
      parameters: filesystemMcpTool.inputSchema || { type: "object", properties: {} },
      execute: async (args, ctx) => {
        // Route through PathJail so the knowledge root (Second Brain) is readable
        // and sensitive paths stay blocked — same semantics as read_file.
        const rawPath = String((args as { path?: unknown })?.path ?? "").trim();
        if (rawPath && ctx?.jail) {
          ctx.jail.assertPathInJail(rawPath, filesystemMcpTool.name, true);
        }
        const res = await filesystemMcpTool.handler!(args);
        if (res.isError) {
          throw new Error(res.content[0]?.text || "MCP filesystem error");
        }
        return res.content[0]?.text || "";
      },
    },
    "builtin"
  );
}
