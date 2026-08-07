// packages/core/src/replay/trajectory.ts
//
// P1.4: 轨迹记录器 — 把 RuntimeEvent[] 投影为 ReplayTrajectory。
// 纯函数、无 I/O：tool_call/tool_result 按 toolCallId 配对，
// 文件改动从写类工具 args 提取，用量/成本从 run_finished 聚合。
import type { RuntimeEvent } from "../types/event.js";
import type { ReplayToolCall, ReplayTrajectory } from "./types.js";

const FILE_MUTATING_TOOLS = new Set([
  "write_file",
  "replace_file_content",
  "delete_file",
  "append_file",
  "create_file",
]);

/** 从工具 args 提取被操作的文件路径（保持顺序，去重） */
function extractChangedFiles(toolCalls: ReplayToolCall[]): string[] {
  const files: string[] = [];
  const seen = new Set<string>();
  for (const tc of toolCalls) {
    if (!FILE_MUTATING_TOOLS.has(tc.name)) continue;
    const path = String(tc.args?.path ?? tc.args?.filePath ?? tc.args?.file ?? "");
    if (path && !seen.has(path)) {
      seen.add(path);
      files.push(path);
    }
  }
  return files;
}

/** 事件流 → 轨迹（确定性投影，不触发任何 LLM/工具调用） */
export function recordTrajectoryFromEvents(
  sessionId: string,
  events: RuntimeEvent[]
): ReplayTrajectory {
  const firstUser = events.find((e) => e.type === "user_message");
  const prompt = firstUser?.type === "user_message" ? String(firstUser.payload.content ?? "") : "";

  const toolCalls: ReplayToolCall[] = [];
  const resultsByCallId = new Map<
    string,
    { result: string; isError: boolean; durationMs?: number }
  >();
  for (const e of events) {
    if (e.type === "tool_result") {
      resultsByCallId.set(e.payload.toolCallId, {
        result: e.payload.result,
        isError: e.payload.isError,
        durationMs: e.payload.durationMs,
      });
    }
  }
  for (const e of events) {
    if (e.type !== "tool_call") continue;
    const res = resultsByCallId.get(e.payload.toolCallId);
    toolCalls.push({
      name: e.payload.toolName,
      args: e.payload.args ?? {},
      result: res?.result ?? "",
      isError: res?.isError ?? false,
      durationMs: res?.durationMs,
    });
  }

  const errorEvents =
    events.filter((e) => e.type === "error").length + toolCalls.filter((t) => t.isError).length;

  let durationMs = 0;
  let totalTokens = 0;
  let costUsd = 0;
  for (const e of events) {
    if (e.type !== "run_finished") continue;
    durationMs += e.payload.durationMs ?? 0;
    totalTokens += e.payload.usage?.totalTokens ?? 0;
    costUsd += e.payload.usage?.costUsd ?? 0;
  }

  return {
    sessionId,
    prompt,
    toolCalls,
    changedFiles: extractChangedFiles(toolCalls),
    errorEvents,
    durationMs,
    totalTokens,
    costUsd,
  };
}
