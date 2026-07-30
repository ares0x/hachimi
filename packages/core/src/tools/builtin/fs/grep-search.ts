import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import type { ToolDefinition } from "../../types.js";

const DEFAULT_MAX_RESULTS = 100;
const IGNORED_PATHS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".gemini"]);

export const grepSearchTool: ToolDefinition = {
  name: "grep_search",
  description:
    "Performs fast regex or literal text pattern search across files within the workspace. Returns matching lines with file paths and line numbers.",
  permission: "safe",
  readOnly: true,
  isIdempotent: true,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search pattern or regular expression" },
      path: {
        type: "string",
        description: "Relative directory or file path to search, defaults to .",
      },
      isRegex: { type: "boolean", description: "If true, treats query as a regular expression" },
      caseInsensitive: {
        type: "boolean",
        description: "If true, performs case-insensitive search",
      },
      maxResults: {
        type: "number",
        description: `Max match results, defaults to ${DEFAULT_MAX_RESULTS}`,
      },
    },
    required: ["query"],
  },
  async execute(args, ctx) {
    const queryStr = String(args.query ?? "");
    const searchPath = String(args.path ?? ".") || ".";
    const isRegex = Boolean(args.isRegex ?? false);
    const caseInsensitive = Boolean(args.caseInsensitive ?? false);
    const maxResults = Number(args.maxResults ?? DEFAULT_MAX_RESULTS) || DEFAULT_MAX_RESULTS;

    if (!queryStr) return "[Error] Query cannot be empty";

    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(searchPath, "grep_search");
      if (!existsSync(safePath)) return `[Path Not Found] ${searchPath}`;

      let regex: RegExp;
      try {
        const flags = caseInsensitive ? "i" : "";
        regex = isRegex
          ? new RegExp(queryStr, flags)
          : new RegExp(queryStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
      } catch (err) {
        return `[Invalid Pattern] Regex compilation error: ${err instanceof Error ? err.message : String(err)}`;
      }

      const matchingFiles: string[] = [];
      const workspaceRoot = ctx.workspaceRoot;

      const walk = (dir: string): void => {
        if (matchingFiles.length >= maxResults) return;
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (IGNORED_PATHS.has(entry.name)) continue;
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            matchingFiles.push(fullPath);
          }
        }
      };

      const st = statSync(safePath);
      if (st.isDirectory()) {
        walk(safePath);
      } else if (st.isFile()) {
        matchingFiles.push(safePath);
      }

      const results: string[] = [];
      let totalMatches = 0;

      for (const file of matchingFiles) {
        if (totalMatches >= maxResults) break;
        const relPath = relative(workspaceRoot, file);
        const stream = createReadStream(file, { encoding: "utf-8" });
        const rl = createInterface({ input: stream, crlfDelay: Infinity });

        let lineNo = 0;
        for await (const line of rl) {
          lineNo += 1;
          if (regex.test(line)) {
            totalMatches += 1;
            results.push(`${relPath}:${lineNo}: ${line.trim()}`);
            if (totalMatches >= maxResults) break;
          }
        }
      }

      if (results.length === 0) {
        return `No matches found for query "${queryStr}" under ${searchPath}.`;
      }

      return `Grep matches for "${queryStr}" (${results.length} results):\n${results.join("\n")}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[grep_search failed]: ${msg}`;
    }
  },
};
