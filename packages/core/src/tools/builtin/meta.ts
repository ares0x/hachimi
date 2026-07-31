import type { ToolDefinition } from "../types.js";

export const calculatorTool: ToolDefinition = {
  name: "calculator",
  kind: "calc",
  description: "Executes basic arithmetic calculation (add, subtract, multiply, divide)",
  permission: "safe",
  readOnly: true,
  isIdempotent: true,
  parameters: {
    type: "object",
    properties: {
      a: { type: "number", description: "First number" },
      b: { type: "number", description: "Second number" },
      operator: { type: "string", enum: ["+", "-", "*", "/"], description: "Operator" },
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
        return b === 0 ? "Error: division by zero" : String(a / b);
      default:
        return "Unsupported operator";
    }
  },
};

export const getCurrentDatetimeTool: ToolDefinition = {
  name: "get_current_datetime",
  kind: "meta",
  description: "Gets current local date, time, and timezone information",
  permission: "safe",
  readOnly: true,
  isIdempotent: true,
  parameters: {
    type: "object",
    properties: {
      format: {
        type: "string",
        description: "Format type: ISO or local, defaults to local",
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
