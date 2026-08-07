import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { captureBeforeFileHistory } from "../../../rewind/file-history.js";
import type { ToolDefinition } from "../../types.js";

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  kind: "write",
  description:
    "Writes or appends text content to a file in the workspace. Automatically creates parent directories.",
  // 'safe': PathJail enforces the real boundary (workspace / knowledgeRoot) at execute() time.
  // Removing the per-write confirmation interruption that was breaking the normal dev flow.
  // delete_file remains needs_confirm because deletion is irreversible.
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path within workspace" },
      content: { type: "string", description: "Text content to write or append" },
      append: {
        type: "boolean",
        description: "If true, appends content to the end of the file instead of overwriting",
      },
    },
    required: ["path", "content"],
  },
  async execute(args, ctx) {
    const filePath = String(args.path ?? "");
    const content = String(args.content ?? "");
    const appendMode = Boolean(args.append ?? false);

    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(filePath, "write_file");
      // P2.6: 编辑前自动捕获 before 快照（供 /rewind 撤销本次修改）
      if (existsSync(safePath)) {
        await captureBeforeFileHistory(ctx.fileHistory, {
          sessionId: ctx.sessionId,
          filePath,
          content: readFileSync(safePath, "utf-8"),
          toolName: "write_file",
        });
      }
      const dir = dirname(safePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      if (appendMode) {
        appendFileSync(safePath, content, "utf-8");
      } else {
        writeFileSync(safePath, content, "utf-8");
      }

      const bytes = Buffer.byteLength(content, "utf-8");
      return `[Write Success] path=${filePath} bytes=${bytes} mode=${appendMode ? "append" : "overwrite"}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[Write Failed]: ${msg}`;
    }
  },
};
