// packages/core/src/tools/builtin/meta/file-history-tools.ts
//
// P2.6: Rewind 工具面 — 手动快照 / 查看快照链 / 恢复快照。
// 自动 before 快照由写工具（write_file / replace_file_content / delete_file）
// 在变更前捕获；这里提供显式能力，让模型与用户可以主动 checkpoint 与回滚。

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { FileHistoryStore } from "../../../rewind/file-history.js";
import type { ToolDefinition } from "../../types.js";

interface FileHistoryCtx {
  fileHistory?: FileHistoryStore;
  sessionId?: string;
  jail?: { assertPathInJail: (p: string, tool: string) => string };
}

function requireHistory(ctx: FileHistoryCtx): { store: FileHistoryStore; sessionId: string } {
  if (!ctx?.fileHistory) throw new Error("FileHistory store is not available in this context");
  if (!ctx.sessionId) throw new Error("sessionId is required for file history");
  return { store: ctx.fileHistory, sessionId: ctx.sessionId };
}

/** 手动 checkpoint：将文件当前内容固化为一条 manual 快照 */
export const fileHistorySnapshotTool: ToolDefinition = {
  name: "file_history_snapshot",
  kind: "meta",
  description:
    "Manually snapshot a file's current content as a rewind checkpoint (before risky refactors or multi-step edits). Returns the snapshot ref; use file_history_list to inspect the chain.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path within workspace" },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const filePath = String(args.path ?? "");
    if (!filePath) return "[file_history_snapshot] path is required";
    try {
      const { store, sessionId } = requireHistory(ctx as FileHistoryCtx);
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(filePath, "file_history_snapshot");
      if (!existsSync(safePath)) return `[File Not Found] ${filePath}`;
      const content = readFileSync(safePath, "utf-8");
      const ev = await store.capture({
        sessionId,
        filePath,
        content,
        mode: "manual",
        toolName: "file_history_snapshot",
      });
      if (!ev) return `[file_history_snapshot] 内容未变化，跳过快照`;
      return `[Snapshot Saved] ${filePath} → ref=${ev.payload.ref}`;
    } catch (err) {
      return `[file_history_snapshot] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/** 查看某文件（或全部）的快照链 */
export const fileHistoryListTool: ToolDefinition = {
  name: "file_history_list",
  kind: "read",
  description:
    "List the rewind snapshot chain for a file (or all files). Each entry has a ref usable with restore_file_snapshot. Snapshots evicted by the 100-per-session cap are marked unavailable.",
  permission: "safe",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Optional relative file path to filter" },
    },
    required: [],
  },
  async execute(args, ctx) {
    try {
      const { store, sessionId } = requireHistory(ctx as FileHistoryCtx);
      const chain = await store.listChain(sessionId, args?.path ? String(args.path) : undefined);
      if (chain.files.length === 0) {
        return "[file_history_list] 暂无快照（编辑文件时会自动记录 before 快照）";
      }
      const lines: string[] = ["[File History Snapshots]"];
      for (const f of chain.files) {
        lines.push(`- ${f.filePath}`);
        for (const s of f.snapshots) {
          const avail = store.hasContent(s.ref) ? "" : " [evicted]";
          const who = s.toolName ? ` via ${s.toolName}` : "";
          lines.push(
            `  #${s.eventId.slice(-6)} ${s.mode} ${new Date(s.timestamp).toISOString()} ` +
              `${s.size}B ref=${s.ref}${who}${avail}`
          );
        }
      }
      return lines.join("\n");
    } catch (err) {
      return `[file_history_list] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/** 恢复快照：把历史内容写回工作区（写操作，需要用户确认） */
export const restoreFileSnapshotTool: ToolDefinition = {
  name: "restore_file_snapshot",
  kind: "write",
  description:
    "Restore a file to the content captured in a rewind snapshot (ref from file_history_snapshot / file_history_list). Overwrites the current file content.",
  permission: "needs_confirm",
  parameters: {
    type: "object",
    properties: {
      ref: { type: "string", description: "Snapshot ref in the form {sessionId}/{eventId}" },
    },
    required: ["ref"],
  },
  async execute(args, ctx) {
    const ref = String(args.ref ?? "");
    if (!ref) return "[restore_file_snapshot] ref is required";
    try {
      const { store } = requireHistory(ctx as FileHistoryCtx);
      const content = store.readContent(ref);
      if (content === null) {
        return "[restore_file_snapshot] 快照内容不可用（可能已被容量上限淘汰）";
      }
      const sessionId = ref.replace(/\\/g, "/").split("/")[0];
      const chain = await store.listChain(sessionId);
      const file = chain.files.find((f) => f.snapshots.some((s) => s.ref === ref));
      if (!file) throw new Error(`快照 ${ref} 不在事件流中`);
      if (!ctx?.jail) throw new Error("ToolExecContext.jail is required");
      const safePath = ctx.jail.assertPathInJail(file.filePath, "restore_file_snapshot");
      writeFileSync(safePath, content, "utf-8");
      return `[Restore Success] ${file.filePath} ← ${ref} (${content.length} chars)`;
    } catch (err) {
      return `[restore_file_snapshot] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
