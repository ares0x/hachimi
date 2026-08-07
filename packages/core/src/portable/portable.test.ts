// packages/core/src/portable/portable.test.ts
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAppContext } from "../runtime/context.js";
import { exportBundle } from "./exporter.js";
import { importBundle } from "./importer.js";
import { migrateBundleToLatest } from "./migrator.js";

/**
 * Create an isolated AppContext with its own temp data directory,
 * preventing SQLITE_BUSY race conditions during parallel test execution.
 */
function isolatedCtx() {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "hachimi-portable-test-"));
  return createAppContext({
    providerOverride: "mock",
    configOverride: {
      paths: {
        dataDir: tmpDir,
        sessionsDir: path.join(tmpDir, "sessions"),
        memoryFile: path.join(tmpDir, "memory.json"),
      },
    } as any,
  });
}

describe("Phase D Portable Memory (Bundle Export / Import / Migration)", () => {
  it("exportBundle creates valid V1 bundle with SHA256 checksum", async () => {
    const context = isolatedCtx();
    context.memory.remember("测试记忆条目 1", 0.8);

    const bundle = await exportBundle(context);
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.checksum).toBeDefined();
    expect(bundle.checksum.length).toBe(64);
    expect(bundle.memory.longTerm.length).toBeGreaterThan(0);
  });

  it("exportBundle redacts secrets from memory and sessions (P0-5)", async () => {
    const context = isolatedCtx();
    context.memory.remember("我的 OpenAI key 是 sk-abcdefghijklmnopqrstuvwxyz123456", 0.9);
    const session = context.sessions.create("会话", "sess_redact_test");
    session.messages.push({
      id: "msg_1",
      role: "user",
      content: "password=hunter2secret123456",
      timestamp: Date.now(),
    });
    context.sessions.save(session);

    const bundle = await exportBundle(context);
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(serialized).not.toContain("hunter2secret123456");
    expect(serialized).toContain("[REDACTED]");
  });

  it("importBundle performs additive merge and deduplication", async () => {
    const sourceCtx = isolatedCtx();
    sourceCtx.memory.remember("独一无二的记忆 A", 0.9);

    const bundle = await exportBundle(sourceCtx);

    const targetCtx = isolatedCtx();
    targetCtx.memory.remember("已有记忆 B", 0.7);
    targetCtx.memory.remember("独一无二的记忆 A", 0.9); // 重复记忆

    const result = await importBundle(targetCtx, bundle, { mergeStrategy: "additive" });
    expect(result.success).toBe(true);
    expect(result.checksumValid).toBe(true);
    expect(result.skippedMemoriesCount).toBeGreaterThan(0);
  }, 30000);

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
