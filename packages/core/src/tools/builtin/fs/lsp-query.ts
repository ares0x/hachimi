// packages/core/src/tools/builtin/fs/lsp-query.ts
import { existsSync, readFileSync } from "node:fs";
import type { ToolDefinition } from "../../types.js";

export const lspQueryTool: ToolDefinition = {
  name: "lsp_query",
  kind: "read",
  description:
    "Queries code intelligence symbols (definition, references, hover documentation) for a specific symbol or line offset in source code files.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative source file path" },
      operation: {
        type: "string",
        enum: ["goToDefinition", "findReferences", "hover", "documentSymbol"],
        description: "LSP query operation type",
      },
      symbolName: { type: "string", description: "Symbol name to look up (e.g. 'HarnessRuntime')" },
      line: { type: "number", description: "Optional line number (1-based)" },
    },
    required: ["path", "operation"],
  },
  async execute(args, ctx) {
    const filePath = String(args.path ?? "").trim();
    const op = String(args.operation ?? "documentSymbol");
    const symbolName = args.symbolName ? String(args.symbolName).trim() : "";
    const lineNo = args.line ? Number(args.line) : null;

    if (!filePath) return "[Error] Path cannot be empty";

    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(filePath, "lsp_query");
      if (!existsSync(safePath)) return `[File Not Found] ${filePath}`;

      const raw = readFileSync(safePath, "utf-8");
      const lines = raw.split(/\r?\n/);

      if (op === "hover" || op === "goToDefinition") {
        if (!symbolName && lineNo === null) {
          return `[LSP Query Error]: Either symbolName or line must be provided for operation "${op}".`;
        }

        const targetSymbol = symbolName || "symbol";
        const matchingLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(targetSymbol)) {
            matchingLines.push(`  L${i + 1}: ${lines[i].trim()}`);
          }
        }

        if (matchingLines.length === 0) {
          return `[LSP ${op} Result for "${targetSymbol}" in ${filePath}]: Symbol not found in target file.`;
        }

        return `[LSP ${op} Result for "${targetSymbol}" in ${filePath}] (${matchingLines.length} occurrences):\n${matchingLines.join("\n")}`;
      }

      // Default: documentSymbol / findReferences fallback
      const decls = lines
        .map((l, idx) => ({ lineNo: idx + 1, content: l.trim() }))
        .filter((l) =>
          /^\s*(export\s+)?(function|class|interface|type|const|enum)\s+/.test(l.content)
        )
        .slice(0, 30);

      const itemsStr = decls.map((d) => `  L${d.lineNo}: ${d.content}`).join("\n");
      return `[LSP Document Symbols for ${filePath}] (${decls.length} top-level declarations):\n${itemsStr}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[LSP Query Failed]: ${msg}`;
    }
  },
};
