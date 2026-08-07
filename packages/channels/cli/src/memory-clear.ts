/**
 * P2-B9: Local data clearing (memories / sessions).
 *
 * Extracted from the CLI handler so the destructive logic is unit-testable.
 * Mirrors the legacy `scripts/clear-*.ts` behavior but targets the real
 * dataDir from config (`~/.hachimi/data`) and supports scoped clears.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SQLiteStore } from "@hachimi/storage";

export interface ClearScope {
  memories: boolean;
  sessions: boolean;
}

export interface ClearResult {
  removed: number;
  memoriesRemoved: number;
  sessionsRemoved: number;
}

/** Delete memories and/or sessions under a dataDir. Returns counts removed. */
export function clearLocalData(dataDir: string, scope: ClearScope): ClearResult {
  const result: ClearResult = { removed: 0, memoriesRemoved: 0, sessionsRemoved: 0 };
  const dbPath = join(dataDir, "hachimi.db");
  const store = existsSync(dbPath) ? new SQLiteStore(dbPath) : null;

  try {
    if (scope.memories) {
      const memoryFile = join(dataDir, "memory.json");
      if (existsSync(memoryFile)) {
        rmSync(memoryFile);
        result.removed++;
        result.memoriesRemoved++;
      }
      if (store) {
        const n = store.clearMemoriesTable() + store.removeAllLike("memory");
        result.removed += n;
        result.memoriesRemoved += n;
      }
    }

    if (scope.sessions) {
      const sessionsDir = join(dataDir, "sessions");
      if (existsSync(sessionsDir)) {
        for (const f of readdirSync(sessionsDir)) {
          if (f.endsWith(".json")) {
            rmSync(join(sessionsDir, f));
            result.removed++;
            result.sessionsRemoved++;
          }
        }
      }
      const eventsDir = join(dataDir, "events");
      if (existsSync(eventsDir)) {
        for (const f of readdirSync(eventsDir)) {
          if (f.endsWith(".jsonl")) {
            rmSync(join(eventsDir, f));
            result.removed++;
            result.sessionsRemoved++;
          }
        }
      }
      if (store) {
        const n = store.removeAllLike("session") + store.removeAllLike("sess_");
        result.removed += n;
        result.sessionsRemoved += n;
      }
    }
  } finally {
    store?.close();
  }

  return result;
}
