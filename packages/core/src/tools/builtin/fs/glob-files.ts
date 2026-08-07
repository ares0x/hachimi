// packages/core/src/tools/builtin/fs/glob-files.ts
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ToolDefinition } from "../../types.js";

/**
 * Converts simple Glob wildcard patterns to RegExp
 */
function globToRegex(glob: string): RegExp {
  const normalized = glob.trim().replace(/\\/g, "/");
  let pattern = normalized;

  if (pattern.startsWith("**/")) {
    pattern = pattern.slice(3);
  }

  const re = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");

  return new RegExp(`${re}$`, "i");
}

export const globFilesTool: ToolDefinition = {
  name: "glob_files",
  kind: "read",
  description:
    "Fast file pattern matching tool. Finds files in the workspace matching a glob pattern (e.g. '**/*.ts' or 'src/**/*.tsx').",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern to match (e.g. '**/*.ts', 'src/components/**/*.tsx')",
      },
      cwd: {
        type: "string",
        description: "Optional subfolder relative to workspace root to search in",
      },
    },
    required: ["pattern"],
  },
  async execute(args, ctx) {
    const pattern = String(args.pattern ?? "").trim();
    if (!pattern) return "[Error] Pattern cannot be empty";

    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const baseSubDir = String(args.cwd ?? "");
      const searchRoot = ctx.jail.assertPathInJail(baseSubDir || ".", "glob_files");

      const regex = globToRegex(pattern);
      const matches: Array<{ path: string; mtime: number }> = [];

      const walk = (dir: string) => {
        let entries: string[] = [];
        try {
          entries = readdirSync(dir);
        } catch {
          return;
        }

        for (const entry of entries) {
          if (
            entry === "node_modules" ||
            entry === ".git" ||
            entry === "dist" ||
            entry === ".hachimi" ||
            entry === ".gemini"
          ) {
            continue;
          }

          const fullPath = join(dir, entry);
          let stat: ReturnType<typeof statSync>;
          try {
            stat = statSync(fullPath);
          } catch {
            continue;
          }

          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (stat.isFile()) {
            const relFromSearchRoot = relative(searchRoot, fullPath).replace(/\\/g, "/");
            const relFromWorkspace = relative(ctx.jail.getWorkspaceRoot(), fullPath).replace(
              /\\/g,
              "/"
            );

            if (
              regex.test(relFromSearchRoot) ||
              regex.test(relFromWorkspace) ||
              regex.test(entry)
            ) {
              matches.push({ path: relFromWorkspace, mtime: stat.mtimeMs });
            }
          }
        }
      };

      walk(searchRoot);

      // Sort by modification time descending
      matches.sort((a, b) => b.mtime - a.mtime);

      if (matches.length === 0) {
        return `[Glob Result for "${pattern}"]: No matching files found in workspace.`;
      }

      const truncated = matches.slice(0, 100);
      const lines = truncated.map((m) => m.path);
      const countNote =
        matches.length > 100 ? `\n...[Showing 100 of ${matches.length} total matches]` : "";

      return `[Glob Matches for "${pattern}"] (${matches.length} files found):\n${lines.join("\n")}${countNote}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[Glob Failed]: ${msg}`;
    }
  },
};
