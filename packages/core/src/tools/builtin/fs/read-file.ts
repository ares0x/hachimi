import { closeSync, createReadStream, existsSync, openSync, readSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import type { ToolDefinition, ToolExecContext } from "../../types.js";

const DEFAULT_LINE_LIMIT = 300;
const MAX_CHARS_PER_READ = 100_000;

function isProbablyBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

async function readTextFileByLine(
  absPath: string,
  offset: number,
  limit: number
): Promise<{
  lines: string[];
  startLine: number;
  endLine: number;
  totalLines: number | null;
  truncated: boolean;
  charTruncated: boolean;
}> {
  const startLine = Math.max(1, Math.floor(offset));
  const maxLines = Math.max(1, Math.floor(limit));

  const stream = createReadStream(absPath, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  const lines: string[] = [];
  let lineNo = 0;
  let truncated = false;
  let charTruncated = false;
  let chars = 0;

  for await (const line of rl) {
    lineNo += 1;
    if (lineNo < startLine) continue;
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
    const numbered = `${lineNo}|${line}`;
    if (chars + numbered.length + 1 > MAX_CHARS_PER_READ) {
      charTruncated = true;
      truncated = true;
      break;
    }
    lines.push(numbered);
    chars += numbered.length + 1;
  }

  return {
    lines,
    startLine,
    endLine: lines.length ? startLine + lines.length - 1 : startLine - 1,
    totalLines: truncated ? null : lineNo,
    truncated,
    charTruncated,
  };
}

function requireJail(ctx?: ToolExecContext) {
  if (!ctx?.jail) {
    throw new Error("ToolExecContext.jail is required for read_file");
  }
  return ctx.jail;
}

export const readFileTool: ToolDefinition = {
  name: "read_file",
  kind: "read",
  description:
    "Reads text file content line by line within the workspace. Supports line pagination: offset specifies starting line (1-based), limit specifies max lines.",
  permission: "safe",
  readOnly: true,
  isIdempotent: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path within workspace" },
      offset: { type: "number", description: "Start line number (1-based), default is 1" },
      limit: {
        type: "number",
        description: `Max number of lines to read, default is ${DEFAULT_LINE_LIMIT}`,
      },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const filePath = String(args.path ?? "");
    const offset = Number(args.offset ?? 1) || 1;
    const limit = Number(args.limit ?? DEFAULT_LINE_LIMIT) || DEFAULT_LINE_LIMIT;

    try {
      const jail = requireJail(ctx);
      const safePath = jail.assertPathInJail(filePath, "read_file", true);

      if (!existsSync(safePath)) {
        return `[文件不存在] ${filePath}`;
      }
      const st = statSync(safePath);
      if (!st.isFile()) {
        return `[不是文件] ${filePath}（若是目录请用 list_dir）`;
      }

      if (st.size > 0) {
        const checkBytes = Math.min(8000, st.size);
        const headBuf = Buffer.alloc(checkBytes);
        const fd = openSync(safePath, "r");
        try {
          readSync(fd, headBuf, 0, checkBytes, 0);
        } finally {
          closeSync(fd);
        }
        if (isProbablyBinary(headBuf)) {
          return `[二进制文件] ${filePath}（${st.size} bytes）。read_file 仅支持文本。`;
        }
      }

      const result = await readTextFileByLine(safePath, offset, limit);
      if (result.lines.length === 0) {
        return `[空范围] ${filePath}：从第 ${offset} 行起无内容。`;
      }

      const header = [
        `path: ${filePath}`,
        `lines: ${result.startLine}-${result.endLine}` +
          (result.totalLines != null ? ` / total_lines: ${result.totalLines}` : ""),
        `size_bytes: ${st.size}`,
        `truncated: ${result.truncated}`,
        result.charTruncated ? `note: 单次返回超过 ${MAX_CHARS_PER_READ} 字符已截断` : null,
        result.truncated
          ? `next: read_file path="${filePath}" offset=${result.endLine + 1} limit=${limit}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      return `${header}\n---\n${result.lines.join("\n")}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[读取拦截/失败]: ${msg}`;
    }
  },
};
