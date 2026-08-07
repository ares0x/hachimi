// scripts/clear-sessions.ts
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { SQLiteStore } from "@hachimi/storage";

function clearSessions() {
  const dataDir = resolve(process.cwd(), "data");
  const dbPath = resolve(dataDir, "hachimi.db");
  const sessionsDir = resolve(dataDir, "sessions");

  let count = 0;

  // 1. Delete all session keys from SQLite kv_store
  if (existsSync(dbPath)) {
    try {
      const store = new SQLiteStore(dbPath);
      count += store.removeAllLike("session");
      count += store.removeAllLike("sess_");
      store.close();
    } catch (err: any) {
      console.warn("⚠️ [SQLite Cleanup] Session deletion error:", err?.message || err);
    }
  }

  // 2. Delete all session json files from data/sessions/
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
