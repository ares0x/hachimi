// scripts/clear-memories.ts
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { SQLiteStore } from "@hachimi/storage";

function clearMemories() {
  const dataDir = resolve(process.cwd(), "data");
  const dbPath = resolve(dataDir, "hachimi.db");
  const memoryFile = resolve(dataDir, "memory.json");

  let count = 0;

  // 1. Delete all memories from SQLite memories table and kv_store memory keys
  if (existsSync(dbPath)) {
    try {
      const store = new SQLiteStore(dbPath);
      count += store.clearMemoriesTable();
      count += store.removeAllLike("memory");
      store.close();
    } catch (err: any) {
      console.warn("⚠️ [SQLite Cleanup] Memory deletion error:", err?.message || err);
    }
  }

  // 2. Delete data/memory.json file if present
  if (existsSync(memoryFile)) {
    try {
      unlinkSync(memoryFile);
      count++;
    } catch (err: any) {
      console.warn("⚠️ [File Cleanup] memory.json deletion error:", err?.message || err);
    }
  }

  console.log(
    `✅ [Hachimi Cleanup] Successfully cleared all historical memories (${count} items cleaned).`
  );
}

clearMemories();
