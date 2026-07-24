// packages/core/src/portable/portable.test.ts
import { describe, expect, it } from "vitest";
import { createAppContext } from "../runtime/context.js";
import { exportBundle } from "./exporter.js";
import { importBundle } from "./importer.js";
import { migrateBundleToLatest } from "./migrator.js";

describe("Phase D Portable Memory (Bundle Export / Import / Migration)", () => {
  it("exportBundle creates valid V1 bundle with SHA256 checksum", async () => {
    const context = createAppContext({ providerOverride: "mock" });
    context.memory.remember("测试记忆条目 1", 0.8);

    const bundle = await exportBundle(context);
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.checksum).toBeDefined();
    expect(bundle.checksum.length).toBe(64);
    expect(bundle.memory.longTerm.length).toBeGreaterThan(0);
  });

  it("importBundle performs additive merge and deduplication", async () => {
    const sourceCtx = createAppContext({ providerOverride: "mock" });
    sourceCtx.memory.remember("独一无二的记忆 A", 0.9);

    const bundle = await exportBundle(sourceCtx);

    const targetCtx = createAppContext({ providerOverride: "mock" });
    targetCtx.memory.remember("已有记忆 B", 0.7);
    targetCtx.memory.remember("独一无二的记忆 A", 0.9); // 重复记忆

    const result = await importBundle(targetCtx, bundle, { mergeStrategy: "additive" });
    expect(result.success).toBe(true);
    expect(result.checksumValid).toBe(true);
    expect(result.skippedMemoriesCount).toBeGreaterThan(0);
  });

  it("migrateBundleToLatest upgrades legacy v0 bundle to v1", () => {
    const legacyRawBundle = {
      schemaVersion: 0,
      createdAt: Date.now(),
      memories: [{ content: "旧版记忆条目", importance: 0.8 }],
    };

    const { bundle, migratedFromVersion } = migrateBundleToLatest(legacyRawBundle);
    expect(migratedFromVersion).toBe(0);
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.checksum).toBeDefined();
    expect(bundle.memory.longTerm[0].content).toBe("旧版记忆条目");
  });
});
