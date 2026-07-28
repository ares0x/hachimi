/**
 * Example: Portable memory export/import
 *
 * Demonstrates Hachimi's portable memory system for backup and migration.
 */

import {
  exportBundle,
  importBundle,
  migrateBundleToLatest,
} from "@hachimi/core";

// Export all memories to a file
async function backupMemories(outputPath: string) {
  const bundle = await exportBundle();
  console.log(`Exported ${bundle.memories.length} memories`);
  console.log(`Schema version: ${bundle.schemaVersion}`);
  console.log(`Checksum: ${bundle.checksum}`);
  // Write to file
  await Bun.write(outputPath, JSON.stringify(bundle, null, 2));
}

// Import and merge memories from a file
async function restoreMemories(inputPath: string) {
  const source = await Bun.file(inputPath).text();
  const result = await importBundle(source, { additive: true });
  console.log(`Imported ${result.imported} memories`);
  console.log(`Skipped ${result.skipped} duplicates`);
}

// Migrate an old bundle to the latest schema
async function migrateOldBundle(inputPath: string) {
  const source = await Bun.file(inputPath).text();
  const migrated = await migrateBundleToLatest(JSON.parse(source));
  console.log(`Migrated to schema v${migrated.schemaVersion}`);
  await Bun.write(inputPath.replace(".json", "-migrated.json"),
    JSON.stringify(migrated, null, 2));
}

// CLI equivalent:
// pnpm dev:cli --export ./backup.json
// pnpm dev:cli --import ./backup.json
