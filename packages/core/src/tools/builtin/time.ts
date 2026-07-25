// packages/core/src/tools/builtin/time.ts
import type { ToolDefinition } from "../../types/index.js";

/**
 * 内置精确报时工具 `get_current_datetime`
 */
export const currentTimeTool: ToolDefinition = {
  name: "get_current_datetime",
  description: "获取系统当前精准的本地日期、时间以及时区信息。",
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
  execute: async (args) => {
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
};
