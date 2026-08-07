// packages/core/src/portable/migrator.ts
import { calculateBundleChecksum } from "./exporter.js";
import type { HachimiBundleV1 } from "./types.js";

/**
 * 自动 Pipeline 迁移函数：升级旧版 Bundle 至最新规范 (HachimiBundleV1)
 */
export function migrateBundleToLatest(rawBundle: any): {
  bundle: HachimiBundleV1;
  migratedFromVersion?: number;
} {
  if (!rawBundle || typeof rawBundle !== "object") {
    throw new Error("Invalid bundle data: Expected JSON object");
  }

  const currentVersion = Number(rawBundle.schemaVersion || 0);

  // 已经是 v1
  if (currentVersion === 1) {
    return { bundle: rawBundle as HachimiBundleV1 };
  }

  // 从 v0 (旧版扁平导出的临时文件) 迁移至 v1
  if (currentVersion === 0) {
    const memory = rawBundle.memory || {};
    const longTerm = Array.isArray(memory.longTerm)
      ? memory.longTerm
      : Array.isArray(rawBundle.memories)
        ? rawBundle.memories
        : [];

    const archival = Array.isArray(memory.archival) ? memory.archival : [];
    const sessions = Array.isArray(rawBundle.sessions) ? rawBundle.sessions : [];

    const migratedData = {
      schemaVersion: 1 as const,
      createdAt: rawBundle.createdAt || Date.now(),
      exportedBy: rawBundle.exportedBy || "legacy-v0-migrator",
      memory: {
        longTerm: longTerm.map((m: any, idx: number) => ({
          id: m.id || `mem_legacy_${idx}`,
          layer: "long_term" as const,
          content: m.content || String(m),
          importance: m.importance ?? 0.5,
          timestamp: m.timestamp || Date.now(),
        })),
        archival: archival.map((m: any, idx: number) => ({
          id: m.id || `mem_archival_${idx}`,
          layer: "archival" as const,
          content: m.content || String(m),
          importance: m.importance ?? 0.5,
          timestamp: m.timestamp || Date.now(),
        })),
      },
      sessions: sessions.map((s: any, idx: number) => ({
        id: s.id || `sess_legacy_${idx}`,
        title: s.title || "Legacy Session",
        createdAt: s.createdAt || Date.now(),
        updatedAt: s.updatedAt || Date.now(),
        messages: Array.isArray(s.messages) ? s.messages : [],
      })),
      skillsState: rawBundle.skillsState,
    };

    const checksum = calculateBundleChecksum(migratedData);
    const bundle: HachimiBundleV1 = {
      ...migratedData,
      checksum,
    };

    return {
      bundle,
      migratedFromVersion: currentVersion,
    };
  }

  throw new Error(`Unsupported bundle schema version: ${rawBundle.schemaVersion}`);
}
