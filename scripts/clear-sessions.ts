// scripts/clear-sessions.ts
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { SQLiteStore } from "@hachimi/storage";

function clearSessions() {
  const dataDir = resolve(process.cwd(), "data");
  const dbPath = resolve(dataDir, "hachimi.db");
  const sessionsDir = resolve(dataDir, "sessions");

  let count = 0;

  // 1. Clear SQLite kv_store sessions
  if (existsSync(dbPath)) {
    try {
      const store = new SQLiteStore(dbPath);
      const sessionKeys = store.list("data/sessions");
      for (const k of sessionKeys) {
        store.remove(`data/sessions/${k}`);
        count++;
      }
      store.close();
    } catch (err: any) {
      console.warn("⚠️ [SQLite Cleanup] Session deletion error:", err?.message || err);
    }
  }

  // 2. Clear File System data/sessions/
  if (existsSync(sessionsDir)) {
    try {
      const files = readdirSync(sessionsDir);
      for (const f of files) {
        if (f.endsWith(".json")) {
          unlinkSync(resolve(sessionsDir, f));
          count++;
        }
      }
    } catch (err: any) {
      console.warn("⚠️ [File Cleanup] Session directory deletion error:", err?.message || err);
    }
  }

  console.log(
    `✅ [Hachimi Cleanup] Successfully cleared all historical sessions (${count} items cleaned).`
  );
}

clearSessions();
