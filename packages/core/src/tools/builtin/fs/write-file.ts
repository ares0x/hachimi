import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ToolDefinition } from "../../types.js";

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description:
    "Writes or appends text content to a file in the workspace. Automatically creates parent directories.",
  permission: "needs_confirm",
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
