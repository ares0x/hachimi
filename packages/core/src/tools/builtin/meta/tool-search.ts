// packages/core/src/tools/builtin/meta/tool-search.ts
import type { ToolDefinition } from "../../types.js";

export const toolSearchTool: ToolDefinition = {
  name: "tool_search",
  kind: "read",
  description:
    "Searches and dynamically loads schema definitions for deferred or available MCP and builtin tools by keyword query when schema space is constrained.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search keyword (e.g. 'database', 'git', 'web', 'file', 'mcp')",
      },
    },
    required: ["query"],
  },
  async execute(args, ctx) {
    const query = String(args.query ?? "")
      .toLowerCase()
      .trim();
    if (!query) return "[Error] Query cannot be empty";

    const registry = (ctx as any)?.registry;
    if (!registry) {
      return "[Tool Search Result]: ToolRegistry context not provided.";
    }

    const allTools: ToolDefinition[] =
      typeof registry.listTools === "function"
        ? registry.listTools()
        : typeof registry.list === "function"
          ? registry.list()
          : [];
    const matches = allTools.filter(
      (t: ToolDefinition) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        (t.kind ? t.kind.toLowerCase().includes(query) : false)
    );

    if (matches.length === 0) {
      return `[Tool Search Result for "${query}"]: No registered tools matched query. (${allTools.length} total tools registered)`;
    }

    const schemas = matches.map((t: ToolDefinition) => ({
      name: t.name,
      kind: t.kind,
      permission: t.permission,
      description: t.description,
      parameters: t.parameters,
    }));

    return `[Tool Search Matches for "${query}"] (${matches.length} tool schemas loaded):\n${JSON.stringify(
      schemas,
      null,
      2
    )}`;
  },
};
