import { existsSync, statSync, unlinkSync } from "node:fs";
import type { ToolDefinition, ToolExecContext } from "../../types.js";

export const deleteFileTool: ToolDefinition = {
  name: "delete_file",
  description: "删除工作区内单个文件（非目录）。受 PathJail 保护。",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "相对工作区路径" },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const filePath = String(args.path ?? "");
    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(filePath, "删除文件");
      if (!existsSync(safePath)) return `[文件不存在] ${filePath}`;
      if (!statSync(safePath).isFile()) {
        return `[拒绝] ${filePath} 不是普通文件（不支持删目录）`;
      }
      unlinkSync(safePath);
      return `[删除成功] ${filePath}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[删除拦截/失败]: ${msg}`;
    }
  },
};
