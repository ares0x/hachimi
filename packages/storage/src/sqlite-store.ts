// packages/storage/src/sqlite-store.ts
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import type { JsonFileStore, JsonDirStore, StorageBackend } from './types.js';
import { log } from "@hachimi/shared";

export class SQLiteStore implements JsonFileStore, JsonDirStore, StorageBackend {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
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

  // JsonFileStore 接口实现
  read<T>(key: string, fallback: T): T {
    try {
      const stmt = this.db.prepare('SELECT value FROM kv_store WHERE key = ?');
      const row = stmt.get(key) as { value: string } | undefined;
      return row ? JSON.parse(row.value) as T : fallback;
    } catch (err) {
      log("warn", `SQLite read failed: ${key}`, err);
      return fallback;
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
    const stmt = this.db.prepare('SELECT 1 FROM kv_store WHERE key = ?');
    return !!stmt.get(key);
  }

  // JsonDirStore 接口实现（简化版，可后续增强）
  ensureDir(_dir: string): void { /* SQLite 不需要目录 */ }
  list(_dir: string): string[] { return []; } // 可实现为查询 key 列表

  readDirEntry<T>(key: string): T | null {
    try {
      const stmt = this.db.prepare('SELECT value FROM kv_store WHERE key = ?');
      const row = stmt.get(key) as { value: string } | undefined;
      return row ? JSON.parse(row.value) as T : null;
    } catch {
      return null;
    }
  }

  writeDirEntry<T>(key: string, data: T): void {
    this.write(key, data);
  }

  remove(key: string): void {
    const stmt = this.db.prepare('DELETE FROM kv_store WHERE key = ?');
    stmt.run(key);
  }

  close() {
    this.db.close();
  }
}
