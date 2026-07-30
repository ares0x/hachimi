import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ToolDefinition } from "../../types.js";

export const replaceFileContentTool: ToolDefinition = {
  name: "replace_file_content",
  description:
    "Surgically replaces a specific target block of text within a file with new content without rewriting the entire file.",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path within workspace" },
      targetContent: { type: "string", description: "Exact target text block to find and replace" },
      replacementContent: { type: "string", description: "New replacement text block" },
    },
    required: ["path", "targetContent", "replacementContent"],
  },
  async execute(args, ctx) {
    const filePath = String(args.path ?? "");
    const targetContent = String(args.targetContent ?? "");
    const replacementContent = String(args.replacementContent ?? "");

    if (!filePath) return "[Error] Path cannot be empty";
    if (!targetContent) return "[Error] Target content cannot be empty";

    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(filePath, "replace_file_content");
      if (!existsSync(safePath)) return `[File Not Found] ${filePath}`;

      const raw = readFileSync(safePath, "utf-8");
      const occurrences = raw.split(targetContent).length - 1;

      if (occurrences === 0) {
        return `[Target Not Found] Could not find exact targetContent in ${filePath}. Verify exact whitespace and characters.`;
      }
      if (occurrences > 1) {
        return `[Ambiguous Target] Found ${occurrences} occurrences of targetContent in ${filePath}. Provide a unique context snippet.`;
      }

      const updated = raw.replace(targetContent, replacementContent);
      writeFileSync(safePath, updated, "utf-8");

      return `[Replace Success] Surgically updated ${filePath} (replaced ${targetContent.length} chars with ${replacementContent.length} chars).`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[Replace Failed]: ${msg}`;
    }
  },
};
