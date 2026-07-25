// packages/core/src/tools/builtin.ts
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
}
