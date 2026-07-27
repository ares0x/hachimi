import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PathJail } from "../sandbox/path-jail.js";
import type { ToolRegistry } from "./registry.js";

/**
 * 注册核心内置基础工具 (Builtin Tools)
 */
export function registerBuiltinTools(tools: ToolRegistry) {
  tools.register({
    name: "calculator",
    description: "执行简单的加减乘除计算",
    permission: "safe",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
        operator: { type: "string", enum: ["+", "-", "*", "/"] },
      },
      required: ["a", "b", "operator"],
    },
    async execute(args) {
      const { a, b, operator } = args as {
        a: number;
        b: number;
        operator: string;
      };
      switch (operator) {
        case "+":
          return String(a + b);
        case "-":
          return String(a - b);
        case "*":
          return String(a * b);
        case "/":
          return String(a / b);
        default:
          return "不支持的运算符";
      }
    },
  });

  tools.register({
    name: "get_current_datetime",
    description: "获取系统当前的精准本地日期、时间以及时区信息",
    permission: "safe",
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          description: "可选的时间格式 (ISO 或 local)，默认 local",
        },
      },
    },
    async execute(args) {
      const now = new Date();
      const format = (args?.format as string) || "local";
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (format === "iso") {
        return `[当前 UTC 时间]: ${now.toISOString()} (时区: ${timeZone})`;
      }

      const localStr = now.toLocaleString("zh-CN", {
        hour12: false,
        dateStyle: "full",
        timeStyle: "medium",
      });

      return `[当前本地时间]: ${localStr} (时区: ${timeZone})`;
    },
  });

  tools.register({
    name: "read_file",
    description: "读取工作区内指定文件的文本内容",
    permission: "safe",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "需要读取的文件路径 (相对工作区)" },
      },
      required: ["path"],
    },
    async execute(args) {
      const { path: filePath } = args as { path: string };
      const jail = new PathJail();
      try {
        const safePath = jail.assertPathInJail(filePath, "读取文件");
        if (!existsSync(safePath)) {
          return `[文件不存在] 无法找到文件: ${filePath}`;
        }
        const content = readFileSync(safePath, "utf-8");
        return content.length > 4000 ? `${content.slice(0, 4000)}\n...[文件过长截断]` : content;
      } catch (err: any) {
        return `[读取拦截/失败]: ${err?.message || String(err)}`;
      }
    },
  });

  // 文件写入工具 (PathJail 沙箱保护，needs_confirm 因为是变更操作)
  tools.register({
    name: "write_file",
    description: "向工作区内指定文件写入文本内容 (受 PathJail 沙箱保护，自动创建父目录)",
    permission: "needs_confirm",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "需要写入的文件路径 (相对工作区)" },
        content: { type: "string", description: "需要写入的文本内容" },
      },
      required: ["path", "content"],
    },
    async execute(args) {
      const { path: filePath, content } = args as { path: string; content: string };
      const jail = new PathJail();
      try {
        const safePath = jail.assertPathInJail(filePath, "写入文件");
        const dir = dirname(safePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(safePath, content, "utf-8");
        return `[写入成功] 已写入 ${content.length} 字符到 ${filePath}`;
      } catch (err: any) {
        return `[写入拦截/失败]: ${err?.message || String(err)}`;
      }
    },
  });

  // 文件删除工具 (PathJail 沙箱保护，needs_confirm 因为是破坏性操作)
  tools.register({
    name: "delete_file",
    description: "删除工作区内指定文件 (受 PathJail 沙箱保护，仅限工作区内单文件)",
    permission: "needs_confirm",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "需要删除的文件路径 (相对工作区)" },
      },
      required: ["path"],
    },
    async execute(args) {
      const { path: filePath } = args as { path: string };
      const jail = new PathJail();
      try {
        const safePath = jail.assertPathInJail(filePath, "删除文件");
        if (!existsSync(safePath)) {
          return `[文件不存在] 无法删除: ${filePath}`;
        }
        unlinkSync(safePath);
        return `[删除成功] 已删除文件: ${filePath}`;
      } catch (err: any) {
        return `[删除拦截/失败]: ${err?.message || String(err)}`;
      }
    },
  });

  // W1.3: 先计划再执行 — 允许 Agent 显式更新或提交 Work 执行计划
  tools.register({
    name: "update_work_plan",
    description: "更新当前 Work 的步骤计划 (Plan Steps)",
    permission: "safe",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "包含 title, status (pending|running|done|skipped) 的步骤列表",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              status: { type: "string", enum: ["pending", "running", "done", "skipped"] },
              description: { type: "string" },
            },
            required: ["title", "status"],
          },
        },
      },
      required: ["steps"],
    },
    async execute(args, options) {
      const steps = args?.steps as Array<{ title: string; status: string; description?: string }>;
      if (!Array.isArray(steps) || steps.length === 0) {
        return "更新失败：steps 必须为非空数组";
      }
      if (options?.workManager && options?.workId) {
        try {
          await options.workManager.updatePlan(options.workId, steps);
        } catch {
          /* ignore */
        }
      }
      return (
        `[Plan 已更新]: 已成功保存 ${steps.length} 个执行步骤:\n` +
        steps.map((s, idx) => `${idx + 1}. [${s.status}] ${s.title}`).join("\n")
      );
    },
  });

  // 目录列举工具 (用 PathJail 沙箱保护)
  tools.register({
    name: "list_dir",
    description: "列出指定目录下的文件和子目录列表 (受 PathJail 沙箱保护)",
    permission: "safe",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "需要列出的目录路径 (相对工作区，默认 .)" },
      },
    },
    async execute(args) {
      const jail = new PathJail();
      const dirPath = (args?.path as string) || ".";
      try {
        const safePath = jail.assertPathInJail(dirPath, "列出目录");
        if (!existsSync(safePath)) {
          return `[目录不存在] 无法找到目录: ${dirPath}`;
        }
        const entries = readdirSync(safePath, { withFileTypes: true });
        const items = entries.map((e) => `${e.isDirectory() ? "[DIR]" : "[FILE]"} ${e.name}`);
        return `目录 ${dirPath} 的内容 (${items.length} 项):\n` + items.join("\n");
      } catch (err: any) {
        return `[读取失败]: ${err?.message || String(err)}`;
      }
    },
  });

  // 命令行工具
  tools.register({
    name: "run_command",
    description: "在工作区执行 Shell 命令行指令 (如 git, ls, pnpm 等)",
    permission: "needs_confirm",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "需要执行的 Shell 命令" },
      },
      required: ["command"],
    },
    async execute(args) {
      const command = ((args?.command as string) || "").trim();
      if (!command) return "命令不能为空";
      try {
        const output = execSync(command, { encoding: "utf-8", timeout: 15000, cwd: process.cwd() });
        return output.length > 4000
          ? `${output.slice(0, 4000)}\n...[输出截断]`
          : output || "(无输出)";
      } catch (err: any) {
        return `[命令执行失败]: ${err?.message || String(err)}`;
      }
    },
  });
}
