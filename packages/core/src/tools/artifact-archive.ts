// packages/core/src/tools/artifact-archive.ts
//
// P1.6: 大工具结果归档 + 按需水合（read_artifact）
//
// 背景：W5 只截断工具结果（静默丢失），模型无法取回被截断的内容。
// 方案：超过 ARTIFACT_MAX_RESULT_BYTES 的结果写入
//   {dataDir}/artifacts/{sessionId}/{toolCallId}.txt
// 事件/历史中保留短摘要 + artifactRef，模型需要完整内容时调用 read_artifact 按需读取。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { log } from "@hachimi/shared";

/** 超过该字节数的工具结果进入归档（与 W5 8KB 上限对齐） */
export const ARTIFACT_MAX_RESULT_BYTES = 8192;

/** 归档后保留给模型的前缀摘要长度 */
const ARCHIVED_SUMMARY_CHARS = 400;

export interface ArchivalResult {
  /** 事件/历史中实际保存的文本（未超限时为原文） */
  text: string;
  /** 归档引用（格式 `{sessionId}/{toolCallId}`，相对 artifacts 根） */
  artifactRef?: string;
}

/**
 * 归档超限工具结果。幂等：同一 toolCallId 重复归档直接返回既有 ref。
 */
export function archiveToolResult(opts: {
  dataDir: string;
  sessionId: string;
  toolCallId: string;
  text: string;
}): ArchivalResult {
  const { dataDir, sessionId, toolCallId, text } = opts;
  if (Buffer.byteLength(text, "utf-8") <= ARTIFACT_MAX_RESULT_BYTES) {
    return { text };
  }

  const ref = `${sessionId}/${toolCallId}`;
  const filePath = resolveArtifactPath(dataDir, ref);
  try {
    mkdirSync(join(resolve(dataDir), "artifacts", sessionId), { recursive: true });
    writeFileSync(filePath, text, "utf-8");
  } catch (err) {
    log("warn", `[ArtifactArchive] Failed to archive tool result ${ref}:`, err);
    return { text }; // 归档失败不阻断，退回截断语义
  }

  const summary =
    text.slice(0, ARCHIVED_SUMMARY_CHARS) + (text.length > ARCHIVED_SUMMARY_CHARS ? "…" : "");
  return {
    text:
      `[工具结果过大 (${(Buffer.byteLength(text, "utf-8") / 1024).toFixed(1)} KB) 已归档 ` +
      `ref=${ref}，需要完整内容请调用 read_artifact 工具读取]\n${summary}`,
    artifactRef: ref,
  };
}

/**
 * 读取归档文件。ref 必须形如 `{sessionId}/{toolCallId}`，路径穿越防御：
 * 解析后必须仍位于 artifacts 根目录内。
 */
export function readArtifactFile(opts: { dataDir: string; ref: string }): string {
  const { dataDir, ref } = opts;
  const artifactsRoot = resolve(dataDir, "artifacts");
  const filePath = resolveArtifactPath(dataDir, ref);

  if (!filePath.startsWith(`${artifactsRoot}/`)) {
    throw new Error(`[read_artifact] 非法引用（路径越界）: ${ref}`);
  }

  if (!existsSync(filePath)) {
    throw new Error(`[read_artifact] 归档文件不存在: ${ref}`);
  }
  return readFileSync(filePath, "utf-8");
}

/** 将 ref（`{sessionId}/{toolCallId}`）解析为 artifacts 根下的绝对路径 */
function resolveArtifactPath(dataDir: string, ref: string): string {
  const clean = String(ref).replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = clean.split("/").filter(Boolean);
  if (segments.length !== 2 || segments.some((s) => s === ".." || s === "." || s.includes(":"))) {
    throw new Error(`[read_artifact] 非法引用格式: ${ref}`);
  }
  return join(resolve(dataDir), "artifacts", ...segments);
}
