// packages/core/src/tools/builtin/meta/read-artifact.ts
//
// P1.6: read_artifact — 按需读取已归档的大工具结果（水合被截断的内容）。
// 只读、安全；ref 格式 `{sessionId}/{toolCallId}`，路径穿越由 archive 模块防御。

import type { ToolDefinition } from "../../../types/index.js";
import { readArtifactFile } from "../../artifact-archive.js";

export function createReadArtifactTool(dataDir: string): ToolDefinition {
  return {
    name: "read_artifact",
    description:
      "读取已归档的大工具结果（工具结果超限时会以 ref=xxx 提示）。参数 ref 格式为 sessionId/toolCallId。",
    permission: "safe",
    kind: "read",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "归档引用，格式: {sessionId}/{toolCallId}（来自超限结果提示中的 ref= 值）",
        },
      },
      required: ["ref"],
    },
    execute: async (args) => {
      const ref = String(args?.ref ?? "").trim();
      if (!ref) return "[read_artifact] 缺少 ref 参数";
      try {
        return readArtifactFile({ dataDir, ref });
      } catch (err) {
        return `[read_artifact] ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}
