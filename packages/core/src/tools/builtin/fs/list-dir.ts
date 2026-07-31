import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "../../types.js";

const DEFAULT_LIST_LIMIT = 200;
const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".gemini",
  ".alma-snapshots",
]);

export const listDirTool: ToolDefinition = {
  name: "list_dir",
  kind: "read",
  description:
    "Lists directory entries within the workspace. Automatically filters giant build/git directories unless includeHidden is true.",
  permission: "safe",
  readOnly: true,
  isIdempotent: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative directory path, defaults to ." },
      limit: {
        type: "number",
        description: `Max number of entries to return, defaults to ${DEFAULT_LIST_LIMIT}`,
      },
      includeHidden: {
        type: "boolean",
        description: "If true, includes node_modules, .git, and hidden files",
      },
    },
  },
  async execute(args, ctx) {
    const dirPath = String(args.path ?? ".") || ".";
    const limit = Number(args.limit ?? DEFAULT_LIST_LIMIT) || DEFAULT_LIST_LIMIT;
    const includeHidden = Boolean(args.includeHidden ?? false);

    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(dirPath, "list_dir", true);
      if (!existsSync(safePath)) return `[Directory Not Found] ${dirPath}`;
      if (!statSync(safePath).isDirectory()) return `[Not a Directory] ${dirPath}`;

      const rawEntries = readdirSync(safePath, { withFileTypes: true });

      const filtered = rawEntries.filter((e) => {
        if (includeHidden) return true;
        if (DEFAULT_IGNORED_DIRS.has(e.name)) return false;
        if (e.name.startsWith(".") && e.name !== ".") return false;
        return true;
      });

      const sliced = filtered.slice(0, Math.max(1, limit));
      const lines = sliced.map((e) => {
        const tag = e.isDirectory() ? "DIR " : e.isSymbolicLink() ? "LINK" : "FILE";
        let sizeInfo = "";
        if (e.isFile()) {
          try {
            const st = statSync(join(safePath, e.name));
            sizeInfo = ` (${st.size} bytes)`;
          } catch {
            // Ignore stat errors for broken symlinks
          }
        }
        return `[${tag}] ${e.name}${sizeInfo}`;
      });

      const moreCount = filtered.length - sliced.length;
      const more = moreCount > 0 ? `\n... plus ${moreCount} entries omitted (increase limit)` : "";

      return `Directory ${dirPath} (${sliced.length}/${filtered.length} entries shown):\n${lines.join("\n")}${more}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[list_dir failed]: ${msg}`;
    }
  },
};
