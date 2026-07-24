// packages/core/src/portable/importer.ts
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppContext } from "../runtime/context.js";
import { calculateBundleChecksum } from "./exporter.js";
import { migrateBundleToLatest } from "./migrator.js";
import type { HachimiBundleV1, ImportBundleOptions, ImportBundleResult } from "./types.js";

/**
 * 导入并融合数据包 (Hachimi Bundle)
 */
export async function importBundle(
  context: AppContext,
  bundleSource: string | Record<string, any>,
  options: ImportBundleOptions = {}
): Promise<ImportBundleResult> {
  const mergeStrategy = options.mergeStrategy || "additive";

  let rawBundleData: any;
  if (typeof bundleSource === "string") {
    const filePath = resolve(bundleSource);
    if (!existsSync(filePath)) {
      throw new Error(`Import bundle file not found: ${filePath}`);
    }
    const fileContent = readFileSync(filePath, "utf-8");
    rawBundleData = JSON.parse(fileContent);
  } else {
    rawBundleData = bundleSource;
  }

  // 1. 自动升级 Schema (D4)
  const { bundle, migratedFromVersion } = migrateBundleToLatest(rawBundleData);

  // 2. Checksum 校验
  const computedChecksum = calculateBundleChecksum(bundle);
  const checksumValid = bundle.checksum === computedChecksum;

  let importedMemoriesCount = 0;
  let skippedMemoriesCount = 0;
  let importedSessionsCount = 0;

  // 3. 记忆与 Session 归档/叠加逻辑 (D3)
  const allImportMemories = [
    ...(bundle.memory?.longTerm || []),
    ...(bundle.memory?.archival || []),
  ];

  if (mergeStrategy === "overwrite") {
    // 覆盖模式：暂无清空接口则直接写入
    for (const mem of allImportMemories) {
      context.memory.remember(mem.content, mem.importance);
      importedMemoriesCount++;
    }
  } else {
    // 默认增量叠加合并 (Additive Merge) + 哈希/文本内容去重
    const existingMemories = new Set(context.memory.list().map((m) => m.content.trim()));

    for (const mem of allImportMemories) {
      const trimmedContent = (mem.content || "").trim();
      if (!trimmedContent) continue;

      if (existingMemories.has(trimmedContent)) {
        skippedMemoriesCount++;
      } else {
        context.memory.remember(trimmedContent, mem.importance ?? 0.5);
        existingMemories.add(trimmedContent);
        importedMemoriesCount++;
      }
    }
  }

  // 4. Session 会话融合
  const incomingSessions = bundle.sessions || [];
  for (const s of incomingSessions) {
    const existingSession = context.sessions.load(s.id);
    if (existingSession) {
      // 兼合并会话消息
      existingSession.title = s.title || existingSession.title;
      existingSession.messages = (s.messages || existingSession.messages) as any;
      context.sessions.save(existingSession);
    } else {
      context.sessions.save({
        id: s.id,
        title: s.title || "导入的会话",
        createdAt: s.createdAt || Date.now(),
        updatedAt: s.updatedAt || Date.now(),
        messages: (s.messages || []) as any,
      });
    }
    importedSessionsCount++;
  }

  return {
    success: true,
    importedMemoriesCount,
    importedSessionsCount,
    skippedMemoriesCount,
    checksumValid,
    migratedFromVersion,
  };
}
