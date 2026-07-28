import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition, ToolExecContext } from "../../types.js";

const execFileAsync = promisify(execFile);
const MAX_COMMAND_CHARS = 50_000;

export const runCommandTool: ToolDefinition = {
  name: "run_command",
  description:
    "在工作区根目录执行命令。推荐 command + args 数组，避免 shell 拼接。" +
    "（兼容旧用法：仅传 command 整串时走 /bin/sh -c，仍受超时与输出上限约束。）",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "可执行文件名，或整串 shell（当未传 args）",
      },
      args: {
        type: "array",
        items: { type: "string" },
        description: "参数列表",
      },
    },
    required: ["command"],
  },
  async execute(args, ctx) {
    const command = String(args.command ?? "").trim();
    const argv = Array.isArray(args.args) ? args.args.map(String) : null;
    if (!command) return "command 不能为空";

    const cwd = ctx?.workspaceRoot || process.cwd();

    try {
      let stdout = "";
      let stderr = "";
      if (argv !== null) {
        // command 为可执行文件名 + args 数组（推荐用法，避免 shell 注入）
        const r = await execFileAsync(command, argv, {
          cwd,
          timeout: 30_000,
          maxBuffer: 2 * 1024 * 1024,
          encoding: "utf-8",
          env: process.env,
        });
        stdout = r.stdout ?? "";
        stderr = r.stderr ?? "";
      } else {
        // 兼容旧用法：整串 shell 命令，走 /bin/sh -c
        const r = await execFileAsync("/bin/sh", ["-c", command], {
          cwd,
          timeout: 30_000,
          maxBuffer: 2 * 1024 * 1024,
          encoding: "utf-8",
          env: process.env,
        });
        stdout = r.stdout ?? "";
        stderr = r.stderr ?? "";
      }

      let out = [stdout, stderr].filter(Boolean).join("\n");
      if (!out) out = "(无输出)";
      if (out.length > MAX_COMMAND_CHARS) {
        const total = out.length;
        out = `${out.slice(0, MAX_COMMAND_CHARS)}\n...[输出截断 total_chars≈${total}]`;
      }
      return out;
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      const msg = e.stderr || e.message || String(err);
      return `[命令失败] ${String(msg).slice(0, MAX_COMMAND_CHARS)}`;
    }
  },
};
