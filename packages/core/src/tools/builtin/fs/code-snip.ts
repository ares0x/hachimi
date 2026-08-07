// packages/core/src/tools/builtin/fs/code-snip.ts
import { existsSync, readFileSync } from "node:fs";
import type { ToolDefinition } from "../../types.js";

export const codeSnipTool: ToolDefinition = {
  name: "code_snip",
  kind: "read",
  description:
    "Extracts high-level code structure and symbol outlines (imports, exports, interface definitions, class/function signatures) from a source file without loading full body contents to save tokens.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path within workspace" },
      maxSymbols: {
        type: "number",
        description: "Maximum number of symbols to extract (default 40)",
      },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const filePath = String(args.path ?? "").trim();
    const maxSymbols = Number(args.maxSymbols || 40);

    if (!filePath) return "[Error] Path cannot be empty";

    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(filePath, "code_snip");
      if (!existsSync(safePath)) return `[File Not Found] ${filePath}`;

      const raw = readFileSync(safePath, "utf-8");
      const lines = raw.split(/\r?\n/);

      const symbolLines: Array<{ lineNo: number; content: string }> = [];

      // Regex matching code declarations
      const declRegex =
        /^\s*(export\s+)?(async\s+)?(function|class|interface|type|const|enum|let|var)\s+([A-Za-z0-9_$]+)/;
      const importRegex = /^\s*import\s+.*/;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (declRegex.test(line) || importRegex.test(line)) {
          symbolLines.push({ lineNo: i + 1, content: line.trim() });
          if (symbolLines.length >= maxSymbols) break;
        }
      }

      if (symbolLines.length === 0) {
        return `[Code Snip Outline for ${filePath}] (${lines.length} lines total):\nNo top-level function/class/interface symbol declarations detected.`;
      }

      const formatted = symbolLines
        .map((s) => `L${s.lineNo.toString().padStart(4, " ")}: ${s.content}`)
        .join("\n");

      return `[Code Snip Outline for ${filePath}] (${lines.length} total lines, ${symbolLines.length} symbols extracted):\n${formatted}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[Code Snip Failed]: ${msg}`;
    }
  },
};
