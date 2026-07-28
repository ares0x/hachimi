import type { ToolDefinition } from "../types.js";

export const calculatorTool: ToolDefinition = {
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
    const a = Number(args.a);
    const b = Number(args.b);
    const operator = String(args.operator);
    switch (operator) {
      case "+":
        return String(a + b);
      case "-":
        return String(a - b);
      case "*":
        return String(a * b);
      case "/":
        return b === 0 ? "错误：除数不能为 0" : String(a / b);
      default:
        return "不支持的运算符";
    }
  },
};

export const getCurrentDatetimeTool: ToolDefinition = {
  name: "get_current_datetime",
  description: "获取系统当前本地日期、时间与时区",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      format: {
        type: "string",
        description: "ISO 或 local，默认 local",
      },
    },
  },
  async execute(args) {
    const now = new Date();
    const format = String(args.format ?? "local");
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
};
