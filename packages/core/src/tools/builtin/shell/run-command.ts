import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ToolSandbox } from "../../../sandbox/sandbox.js";
import { auditShellCommandAST } from "../../../sandbox/shell-ast-guard.js";
import type { ToolDefinition, ToolExecContext } from "../../types.js";

const execFileAsync = promisify(execFile);
const MAX_COMMAND_CHARS = 50_000;

export const runCommandTool: ToolDefinition = {
  name: "run_command",
  kind: "shell",
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
      background: {
        type: "boolean",
        description:
          "If true, runs the command in the background and returns a task_id immediately (use get_command_or_subagent_output / wait_commands_or_subagents to track it)",
      },
    },
    required: ["command"],
  },
  async execute(args, ctx) {
    const command = String(args.command ?? "").trim();
    const argv = Array.isArray(args.args) ? args.args.map(String) : null;
    const background = args.background === true;
    if (!command) return "command 不能为空";

    const fullCmd = argv ? `${command} ${argv.join(" ")}` : command;
    const audit = auditShellCommandAST(fullCmd);
    if (!audit.allowed) {
      return audit.reason || "[安全预审拦截] 高危指令禁止执行";
    }

    const cwd = ctx?.workspaceRoot || process.cwd();

    // P0-3: 后台模式 — 立即返回 task_id，不阻塞 Agent 循环
    if (background) {
      if (!ctx?.backgroundTasks) {
        return "[Error] 后台任务管理器未注入（当前执行链不支持 background 模式）";
      }
      const task = ctx.backgroundTasks.startCommand(fullCmd, {
        cwd,
        env: ctx.env,
        label: command,
      });
      return (
        `[后台任务已启动] task_id=${task.taskId}\n` +
        `查询输出: get_command_or_subagent_output({task_id: "${task.taskId}"})\n` +
        `等待完成: wait_commands_or_subagents({task_ids: ["${task.taskId}"], mode: "any"})`
      );
    }

    try {
      let stdout = "";
      let stderr = "";
      const options: any = {
        cwd,
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf-8",
        env: {
          // 脱敏后的环境：敏感 API Key / Token 不会透传给 shell 子进程
          ...(ctx?.env ?? ToolSandbox.scrubEnv(process.env)),
          CI: "true",
          NONINTERACTIVE: "1",
          DEBIAN_FRONTEND: "noninteractive",
          PAGER: "cat",
          GIT_TERMINAL_PROMPT: "0",
        },
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
      const e = err as { stderr?: string; message?: string; killed?: boolean; signal?: string };
      if (e.killed || e.signal === "SIGKILL") {
        return `[命令超时被终止 (30s)] 该命令运行超过 30 秒限时已被硬性中止，可能存在交互式 stdin 输入等待。`;
      }
      const msg = e.stderr || e.message || String(err);
      return `[命令失败] ${String(msg).slice(0, MAX_COMMAND_CHARS)}`;
    }
  },
};
