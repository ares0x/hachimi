// packages/core/src/tools/builtin/shell/capture-terminal.ts
import { getSubshellManager, type SubshellTask } from "../../../sandbox/subshell-manager.js";
import type { ToolDefinition } from "../../types.js";

export const captureTerminalTool: ToolDefinition = {
  name: "capture_terminal_output",
  kind: "read",
  description:
    "Captures recent console stdout/stderr lines from active background subshell processes managed by SubshellManager.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description:
          "Optional task ID of specific subshell process. Omit to list all active processes.",
      },
      lines: {
        type: "number",
        description: "Number of recent lines to retrieve (default 50)",
      },
    },
  },
  async execute(args) {
    const manager = getSubshellManager();
    const taskId = args.taskId ? String(args.taskId).trim() : "";
    const lineCount = Number(args.lines || 50);

    if (!taskId) {
      const active = manager.listTasks();
      if (active.length === 0) {
        return "[Subshell Monitor]: No active background subshell processes currently running.";
      }

      const listStr = active
        .map(
          (p: SubshellTask) =>
            `  • PID ${p.pid || "N/A"} [${p.id}]: "${p.command}" (Status: ${p.status}, Started: ${new Date(
              p.startedAt
            ).toLocaleTimeString()})`
        )
        .join("\n");
      return `[Subshell Active Processes] (${active.length} running):\n${listStr}\n\nPass taskId to capture specific terminal output.`;
    }

    const proc = manager.getTask(taskId);
    if (!proc) {
      return `[Error] Subshell process with taskId "${taskId}" not found.`;
    }

    const recentLogs = proc.outputBuffer.slice(-lineCount);
    if (recentLogs.length === 0) {
      return `[Terminal Capture for ${taskId}] PID ${proc.pid || "N/A"} (${proc.status}): No output produced yet.`;
    }

    return `[Terminal Capture for ${taskId}] PID ${proc.pid || "N/A"} (${proc.status}, last ${recentLogs.length} lines):\n${recentLogs.join(
      "\n"
    )}`;
  },
};
