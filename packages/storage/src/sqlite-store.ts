// packages/storage/src/sqlite-store.ts
import { log } from "@hachimi/shared";
import Database from "better-sqlite3";
import type { JsonDirStore, JsonFileStore, StorageBackend } from "./types.js";

export class SQLiteStore implements JsonFileStore, JsonDirStore, StorageBackend {
  private db: any;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new (Database as any)(dbPath);
    this.initTables();
    log("info", `SQLite 存储已初始化: ${dbPath}`);
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        layer TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL DEFAULT 0.5,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
    `);
  }

  // JsonFileStore 与 JsonDirStore 共享实现
  read<T>(key: string, fallback?: T): T {
    try {
      const stmt = this.db.prepare("SELECT value FROM kv_store WHERE key = ?");
      const row = stmt.get(key) as { value: string } | undefined;
      if (row) {
        return JSON.parse(row.value) as T;
      }
      return fallback as T;
    } catch (err) {
      log("warn", `SQLite read failed: ${key}`, err);
      return fallback as T;
    }
  }

  write<T>(key: string, data: T): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO kv_store (key, value, updated_at)
        VALUES (?, ?, unixepoch())
      `);
      stmt.run(key, JSON.stringify(data));
    } catch (err) {
      log("error", `SQLite write failed: ${key}`, err);
      throw err;
    }
  }

  exists(key: string): boolean {
    const stmt = this.db.prepare("SELECT 1 FROM kv_store WHERE key = ?");
    return !stmt.get(key);
  }

  // JsonDirStore 接口实现
  ensureDir(_dir: string): void {
    /* SQLite 不需要目录 */
  }

  list(dir: string): string[] {
    try {
      const normalized = dir.replace(/\\/g, "/");
      const prefix = normalized.endsWith("/") ? normalized : `${normalized}/`;
      const stmt = this.db.prepare("SELECT key FROM kv_store WHERE key LIKE ?");
      const rows = stmt.all(`${prefix}%`) as Array<{ key: string }>;
      return rows.map((r) => {
        const k = r.key.replace(/\\/g, "/");
        return k.substring(prefix.length);
      });
    } catch (err) {
      log("warn", `SQLite list failed: ${dir}`, err);
      return [];
    }
  }

  readDirEntry<T>(key: string): T | null {
    return this.read<T>(key, null as any);
  }

  writeDirEntry<T>(key: string, data: T): void {
    this.write(key, data);
  }

  remove(key: string): void {
    const stmt = this.db.prepare("DELETE FROM kv_store WHERE key = ?");
    stmt.run(key);
  }

  close() {
    this.db.close();
  }
}
