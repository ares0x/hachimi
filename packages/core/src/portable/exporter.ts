// packages/core/src/portable/exporter.ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AppContext } from "../runtime/context.js";
import type { ExportBundleOptions, HachimiBundleV1 } from "./types.js";

/**
 * 校验和计算函数
 */
export function calculateBundleChecksum(
  bundleWithoutChecksum: Omit<HachimiBundleV1, "checksum">
): string {
  const contentStr = JSON.stringify({
    schemaVersion: bundleWithoutChecksum.schemaVersion,
    memory: bundleWithoutChecksum.memory,
    sessions: bundleWithoutChecksum.sessions,
    skillsState: bundleWithoutChecksum.skillsState,
  });
  return createHash("sha256").update(contentStr).digest("hex");
}

/**
 * 导出全量记忆与会话数据包 (Hachimi Bundle V1)
 */
export async function exportBundle(
  context: AppContext,
  options: ExportBundleOptions = {}
): Promise<HachimiBundleV1> {
  const longTermMemories = context.memory.list("long_term");
  const archivalMemories = context.memory.list("archival");
  const sessions = context.sessions.list();

  const bundleDataWithoutChecksum = {
    schemaVersion: 1 as const,
    createdAt: Date.now(),
    exportedBy: options.exportedBy || "hachimi-core-sdk",
    memory: {
      longTerm: longTermMemories.map((m: any) => ({
        id: m.id,
        layer: m.layer,
        content: m.content,
        importance: m.importance,
        timestamp: m.updatedAt || m.createdAt || Date.now(),
      })),
      archival: archivalMemories.map((m: any) => ({
        id: m.id,
        layer: m.layer,
        content: m.content,
        importance: m.importance,
        timestamp: m.updatedAt || m.createdAt || Date.now(),
      })),
    },
    sessions: sessions.map((s: any) => ({
      id: s.id,
      title: s.title || "未命名会话",
      createdAt: s.createdAt || Date.now(),
      updatedAt: s.updatedAt || Date.now(),
      messages: s.messages || [],
    })),
    skillsState: {
      activeSkill: (context as any).activeSkill,
    },
  };

  const checksum = calculateBundleChecksum(bundleDataWithoutChecksum);
  const fullBundle: HachimiBundleV1 = {
    ...bundleDataWithoutChecksum,
    checksum,
  };

  if (options.filePath) {
    const targetPath = resolve(options.filePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, JSON.stringify(fullBundle, null, 2), "utf-8");
  }

  return fullBundle;
}
