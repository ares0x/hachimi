import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { captureBeforeFileHistory } from "../../../rewind/file-history.js";
import type { ToolDefinition } from "../../types.js";

export const deleteFileTool: ToolDefinition = {
  name: "delete_file",
  kind: "delete",
  description: "Deletes a single file within the workspace. Protected by PathJail.",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path within workspace" },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const filePath = String(args.path ?? "");
    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(filePath, "delete_file");
      if (!existsSync(safePath)) return `[File Not Found] ${filePath}`;
      if (!statSync(safePath).isFile()) {
        return `[Refused] ${filePath} is not a regular file (directories are not supported)`;
      }
      // P2.6: 删除前自动捕获 before 快照（/rewind 可恢复被删文件）
      await captureBeforeFileHistory(ctx.fileHistory, {
        sessionId: ctx.sessionId,
        filePath,
        content: readFileSync(safePath, "utf-8"),
        toolName: "delete_file",
      });
      unlinkSync(safePath);
      return `[Delete Success] ${filePath}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[Delete Failed]: ${msg}`;
    }
  },
};
