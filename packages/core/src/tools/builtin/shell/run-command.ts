import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { auditShellCommandAST } from "../../../sandbox/shell-ast-guard.js";
import type { ToolDefinition, ToolExecContext } from "../../types.js";

const execFileAsync = promisify(execFile);
const MAX_COMMAND_CHARS = 50_000;

export const runCommandTool: ToolDefinition = {
  name: "run_command",
  description:
    "Executes a shell command in the workspace root. Recommends executable command and args array to prevent shell injection.",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Executable name or full shell command string when args is omitted",
      },
      args: {
        type: "array",
        items: { type: "string" },
        description: "Array of command arguments",
      },
    },
    required: ["command"],
  },
  async execute(args, ctx) {
    const command = String(args.command ?? "").trim();
    const argv = Array.isArray(args.args) ? args.args.map(String) : null;
    if (!command) return "command 不能为空";

    const fullCmd = argv ? `${command} ${argv.join(" ")}` : command;
    const audit = auditShellCommandAST(fullCmd);
    if (!audit.allowed) {
      return audit.reason || "[安全预审拦截] 高危指令禁止执行";
    }

    const cwd = ctx?.workspaceRoot || process.cwd();

    try {
      let stdout = "";
      let stderr = "";
      const options: any = {
        cwd,
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf-8",
        env: process.env,
        signal: ctx?.signal,
        killSignal: "SIGKILL",
      };

      if (argv !== null) {
        // command 为可执行文件名 + args 数组（推荐用法，避免 shell 注入）
        const r = await execFileAsync(command, argv, options);
        stdout = String(r.stdout ?? "");
        stderr = String(r.stderr ?? "");
      } else {
        // 兼容旧用法：整串 shell 命令，走 /bin/sh -c
        const r = await execFileAsync("/bin/sh", ["-c", command], options);
        stdout = String(r.stdout ?? "");
        stderr = String(r.stderr ?? "");
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
