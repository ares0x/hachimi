import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { captureBeforeFileHistory } from "../../../rewind/file-history.js";
import type { ToolDefinition } from "../../types.js";

export const replaceFileContentTool: ToolDefinition = {
  name: "replace_file_content",
  description:
    "Surgically replaces a specific target block of text within a file with new content without rewriting the entire file.",
  // 'safe': PathJail enforces the real boundary at execute() time.
  // Removing per-edit confirmation that was interrupting normal coding flow.
  permission: "safe",
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

      // P2.6: 编辑前自动捕获 before 快照（供 /rewind 撤销本次修改）
      await captureBeforeFileHistory(ctx.fileHistory, {
        sessionId: ctx.sessionId,
        filePath,
        content: readFileSync(safePath, "utf-8"),
        toolName: "replace_file_content",
      });

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
