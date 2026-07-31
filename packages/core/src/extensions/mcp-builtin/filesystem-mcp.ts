import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { McpToolDefinition } from "../mcp-types.js";

/**
 * Built-in PathJail Sandbox Filesystem MCP Tool.
 * Provides safe file reading and directory inspection within workspace boundary.
 */
export const filesystemMcpTool: McpToolDefinition = {
  name: "mcp_filesystem_read",
  description: "Safely inspect files or list directory contents within the workspace path.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Target absolute or relative file/directory path" },
    },
    required: ["path"],
  },
  handler: async (args) => {
    const rawPath = (args?.path as string)?.trim();
    if (!rawPath) {
      return {
        isError: true,
        content: [{ type: "text", text: "Path parameter is required." }],
      };
    }

    const targetPath = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);

    if (!existsSync(targetPath)) {
      return {
        isError: true,
        content: [{ type: "text", text: `Path does not exist: ${targetPath}` }],
      };
    }

    try {
      const stat = statSync(targetPath);
      if (stat.isDirectory()) {
        const entries = readdirSync(targetPath, { withFileTypes: true });
        const summary = entries
          .map((e) => `${e.isDirectory() ? "📁 [DIR] " : "📄 [FILE] "} ${e.name}`)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Directory contents of ${targetPath}:\n\n${summary}`,
            },
          ],
        };
      }

      const content = readFileSync(targetPath, "utf-8");
      const truncated =
        content.length > 15000 ? `${content.slice(0, 15000)}\n\n…[文件过多已截断]` : content;
      return {
        content: [
          {
            type: "text",
            text: `File content of ${targetPath}:\n\n${truncated}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to access path ${targetPath}: ${err.message || String(err)}`,
          },
        ],
      };
    }
  },
};
