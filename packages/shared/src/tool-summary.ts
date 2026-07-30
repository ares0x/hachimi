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
    oneLineParts.push(`${k}=${truncated ? text + "…" : text}`);
    const { text: fieldText, truncated: fieldTrunc } = truncateText(
      raw,
      MAX_PREVIEW_CHARS,
      MAX_PREVIEW_LINES
    );
    fields.push({
      key: k,
      label: k,
      value: fieldText + (fieldTrunc ? "\n…[已截断]" : ""),
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
      const path = String(safeArgs.path ?? "");
      const content = String(safeArgs.content ?? "");
      const bytes = Buffer.byteLength(content, "utf-8");
      const lines = countLines(content);
      const { text: preview, truncated } = truncateText(content);

      return {
        oneLine: `写入文件 ${path}  (${formatBytes(bytes)}, ${lines} 行)`,
        fields: [
          { key: "path", label: "目标路径", value: path, mono: true },
          {
            key: "size",
            label: "文件大小",
            value: `${formatBytes(bytes)}  ·  ${lines} 行`,
          },
          {
            key: "content",
            label: "内容预览",
            value:
              preview +
              (truncated
                ? `\n…[仅预览前 ${MAX_PREVIEW_LINES} 行 / ${MAX_PREVIEW_CHARS} 字符，完整内容 ${formatBytes(bytes)}]`
                : ""),
            truncated,
            code: true,
          },
        ],
      };
    }

    case "delete_file": {
      const path = String(safeArgs.path ?? "");
      return {
        oneLine: `删除文件 ${path}`,
        fields: [
          { key: "path", label: "目标路径", value: path, mono: true },
          {
            key: "warn",
            label: "注意",
            value: "此操作将永久删除该文件（不可恢复目录）",
          },
        ],
      };
    }

    case "read_file": {
      const path = String(safeArgs.path ?? "");
      const offset = safeArgs.offset !== undefined ? Number(safeArgs.offset) : 1;
      const limit = safeArgs.limit !== undefined ? Number(safeArgs.limit) : undefined;
      return {
        oneLine: `读取文件 ${path}${limit ? `  (第 ${offset}-${offset + limit - 1} 行)` : ""}`,
        fields: [
          { key: "path", label: "路径", value: path, mono: true },
          {
            key: "range",
            label: "范围",
            value: `offset=${offset}, limit=${limit ?? "(默认)"}`,
          },
        ],
      };
    }

    case "list_dir": {
      const path = String(safeArgs.path ?? ".");
      return {
        oneLine: `列出目录 ${path}`,
        fields: [{ key: "path", label: "目录", value: path, mono: true }],
      };
    }

    case "run_command": {
      const command = String(safeArgs.command ?? "");
      const cmdArgs = Array.isArray(safeArgs.args) ? safeArgs.args.map(String) : null;
      const fullCmd = cmdArgs ? `${command} ${cmdArgs.join(" ")}` : command;
      const { text: preview, truncated } = truncateText(fullCmd, 300, 4);

      return {
        oneLine: `执行命令 ${truncated ? preview + "…" : preview}`,
        fields: [
          { key: "command", label: "可执行文件", value: command, mono: true },
          ...(cmdArgs
            ? [
                {
                  key: "args",
                  label: "参数列表",
                  value: cmdArgs.join(" "),
                  mono: true,
                  truncated: cmdArgs.join(" ").length > 200,
                },
              ]
            : []),
          {
            key: "cmdline",
            label: "完整命令行",
            value: preview + (truncated ? " …[过长截断]" : ""),
            truncated,
            code: true,
          },
        ],
      };
    }

    case "update_work_plan": {
      const workId = String(safeArgs.workId ?? "");
      const plan = String(safeArgs.plan ?? "");
      const { text: preview, truncated } = truncateText(plan, 500, 15);
      return {
        oneLine: `更新 Work 计划: ${workId || "(未指定)"}`,
        fields: [
          {
            key: "workId",
            label: "Work ID",
            value: workId || "(当前)",
            mono: true,
          },
          {
            key: "plan",
            label: "计划内容",
            value: preview + (truncated ? "\n…[内容已截断]" : ""),
            truncated,
            mono: true,
          },
        ],
      };
    }

    default:
      return genericFallback(toolName, safeArgs);
  }
}
