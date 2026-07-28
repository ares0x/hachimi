import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ToolDefinition, ToolExecContext } from "../../types.js";

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "向工作区写入文本（覆盖整文件），自动创建父目录。受 PathJail 保护。",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "相对工作区路径" },
      content: { type: "string", description: "文件全文" },
    },
    required: ["path", "content"],
  },
  async execute(args, ctx) {
    const filePath = String(args.path ?? "");
    const content = String(args.content ?? "");
    try {
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(filePath, "写入文件");
      const dir = dirname(safePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(safePath, content, "utf-8");
      return `[写入成功] path=${filePath} bytes=${Buffer.byteLength(content, "utf-8")}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[写入拦截/失败]: ${msg}`;
    }
  },
};
