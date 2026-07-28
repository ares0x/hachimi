import { existsSync, readdirSync, statSync } from "node:fs";
import type { ToolDefinition, ToolExecContext } from "../../types.js";

const DEFAULT_LIST_LIMIT = 200;

export const listDirTool: ToolDefinition = {
  name: "list_dir",
  description: "列出工作区目录下的条目。可用 limit 限制数量。",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "相对目录，默认 ." },
      limit: {
        type: "number",
        description: `最多条目数，默认 ${DEFAULT_LIST_LIMIT}`,
      },
    },
  },
  async execute(args, ctx) {
    const dirPath = String(args.path ?? ".") || ".";
    const limit = Number(args.limit ?? DEFAULT_LIST_LIMIT) || DEFAULT_LIST_LIMIT;
    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(dirPath, "列出目录");
      if (!existsSync(safePath)) return `[目录不存在] ${dirPath}`;
      if (!statSync(safePath).isDirectory()) return `[不是目录] ${dirPath}`;

      const entries = readdirSync(safePath, { withFileTypes: true });
      const sliced = entries.slice(0, Math.max(1, limit));
      const lines = sliced.map((e) => {
        const tag = e.isDirectory() ? "DIR" : e.isSymbolicLink() ? "LINK" : "FILE";
        return `[${tag}] ${e.name}`;
      });
      const more =
        entries.length > sliced.length
          ? `\n… 另有 ${entries.length - sliced.length} 项未列出（增大 limit）`
          : "";
      return `目录 ${dirPath}（${sliced.length}/${entries.length}）:\n${lines.join("\n")}${more}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[list_dir 失败]: ${msg}`;
    }
  },
};
