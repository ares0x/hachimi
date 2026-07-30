export interface ToolArgSummary {
  oneLine: string;
  fields: Array<{
    key: string;
    label: string;
    value: string;
    truncated?: boolean;
    code?: boolean;
    mono?: boolean;
  }>;
}

const MAX_PREVIEW_CHARS = 400;
const MAX_PREVIEW_LINES = 12;

function truncateText(
  text: string,
  maxChars = MAX_PREVIEW_CHARS,
  maxLines = MAX_PREVIEW_LINES
): { text: string; truncated: boolean } {
  let t = String(text ?? "");
  const byChars = t.length > maxChars;
  if (byChars) t = t.slice(0, maxChars);
  const lines = t.split("\n");
  const byLines = lines.length > maxLines;
  if (byLines) {
    t = lines.slice(0, maxLines).join("\n");
  }
  return { text: t, truncated: byChars || byLines };
}

function countLines(text: string): number {
  if (!text) return 0;
  return String(text).split("\n").length;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function genericFallback(toolName: string, args: Record<string, unknown>): ToolArgSummary {
  const entries = Object.entries(args);
  const oneLineParts: string[] = [];
  const fields: ToolArgSummary["fields"] = [];

  for (const [k, v] of entries) {
    const raw = typeof v === "string" ? v : JSON.stringify(v);
    const { text, truncated } = truncateText(raw, 120, 3);
    oneLineParts.push(`${k}=${truncated ? `${text}…` : text}`);
    const { text: fieldText, truncated: fieldTrunc } = truncateText(
      raw,
      MAX_PREVIEW_CHARS,
      MAX_PREVIEW_LINES
    );
    fields.push({
      key: k,
      label: k,
      value: fieldText + (fieldTrunc ? "\n...[truncated]" : ""),
      truncated: fieldTrunc,
      mono: true,
    });
  }

  return {
    oneLine: `${toolName}(${oneLineParts.join(", ").slice(0, 120)}${oneLineParts.join(", ").length > 120 ? "…" : ""})`,
    fields,
  };
}

export function summarizeToolArgs(toolName: string, args: Record<string, unknown>): ToolArgSummary {
  const safeArgs = args && typeof args === "object" ? args : {};

  switch (toolName) {
    case "write_file": {
      const path = String(safeArgs.path ?? "?");
      const content = String(safeArgs.content ?? "");
      const bytes = Buffer.byteLength(content, "utf-8");
      const lines = countLines(content);
      const { text: preview, truncated } = truncateText(content);

      return {
        oneLine: `Wrote ${path} (${formatBytes(bytes)}, ${lines} lines)`,
        fields: [
          { key: "path", label: "Path", value: path, mono: true },
          {
            key: "size",
            label: "Size",
            value: `${formatBytes(bytes)} · ${lines} lines`,
          },
          {
            key: "content",
            label: "Preview",
            value:
              preview +
              (truncated
                ? `\n...[preview first ${MAX_PREVIEW_LINES} lines / ${MAX_PREVIEW_CHARS} chars, total ${formatBytes(bytes)}]`
                : ""),
            truncated,
            code: true,
          },
        ],
      };
    }

    case "delete_file": {
      const path = String(safeArgs.path ?? "?");
      return {
        oneLine: `Deleted ${path}`,
        fields: [
          { key: "path", label: "Path", value: path, mono: true },
          {
            key: "warn",
            label: "Note",
            value: "Permanently deleted file",
          },
        ],
      };
    }

    case "read_file": {
      const path = String(safeArgs.path ?? safeArgs.file ?? "?");
      const offset = safeArgs.offset !== undefined ? Number(safeArgs.offset) : 1;
      const limit = safeArgs.limit !== undefined ? Number(safeArgs.limit) : undefined;
      return {
        oneLine: `Read ${path}${limit ? ` (lines ${offset}-${offset + limit - 1})` : ""}`,
        fields: [
          { key: "path", label: "Path", value: path, mono: true },
          {
            key: "range",
            label: "Range",
            value: `offset=${offset}, limit=${limit ?? "(default)"}`,
          },
        ],
      };
    }

    case "list_dir": {
      const path = String(safeArgs.path ?? ".");
      return {
        oneLine: `Listed entries in ${path}`,
        fields: [{ key: "path", label: "Directory", value: path, mono: true }],
      };
    }

    case "grep_search": {
      const query = String(safeArgs.query ?? safeArgs.pattern ?? "");
      const path = String(safeArgs.path ?? ".");
      return {
        oneLine: `Searched for "${query}" in ${path}`,
        fields: [
          { key: "query", label: "Query", value: query, mono: true },
          { key: "path", label: "Path", value: path, mono: true },
        ],
      };
    }

    case "replace_file_content": {
      const path = String(safeArgs.path ?? "?");
      return {
        oneLine: `Replaced content in ${path}`,
        fields: [{ key: "path", label: "Path", value: path, mono: true }],
      };
    }

    case "run_command": {
      const command = String(safeArgs.command ?? "");
      const cmdArgs = Array.isArray(safeArgs.args) ? safeArgs.args.map(String) : null;
      const fullCmd = cmdArgs ? `${command} ${cmdArgs.join(" ")}` : command;
      const { text: preview, truncated } = truncateText(fullCmd, 300, 4);

      return {
        oneLine: `Ran command: ${truncated ? `${preview}…` : preview}`,
        fields: [
          { key: "command", label: "Executable", value: command, mono: true },
          ...(cmdArgs
            ? [
                {
                  key: "args",
                  label: "Args",
                  value: cmdArgs.join(" "),
                  mono: true,
                  truncated: cmdArgs.join(" ").length > 200,
                },
              ]
            : []),
          {
            key: "cmdline",
            label: "CommandLine",
            value: preview + (truncated ? " ...[truncated]" : ""),
            truncated,
            code: true,
          },
        ],
      };
    }

    case "update_work_plan": {
      const workId = String(safeArgs.workId ?? "");
      return {
        oneLine: `Updated Work plan: ${workId || "(current)"}`,
        fields: [
          {
            key: "workId",
            label: "Work ID",
            value: workId || "(current)",
            mono: true,
          },
        ],
      };
    }

    case "delegate_subagent": {
      const desc = String(safeArgs.taskDescription ?? "");
      return {
        oneLine: `Dispatched Sub-Agent: ${desc.slice(0, 50)}${desc.length > 50 ? "…" : ""}`,
        fields: [{ key: "taskDescription", label: "Task", value: desc }],
      };
    }

    case "check_subagent_status": {
      const taskId = String(safeArgs.taskId ?? "?");
      return {
        oneLine: `Checked Sub-Agent status: ${taskId}`,
        fields: [{ key: "taskId", label: "Task ID", value: taskId, mono: true }],
      };
    }

    case "activate_skill": {
      const skillName = String(safeArgs.skill_name ?? "?");
      return {
        oneLine: `Activated skill: ${skillName}`,
        fields: [{ key: "skill_name", label: "Skill", value: skillName, mono: true }],
      };
    }

    default:
      return genericFallback(toolName, safeArgs);
  }
}
