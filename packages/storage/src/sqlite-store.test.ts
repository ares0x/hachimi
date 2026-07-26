// packages/storage/src/sqlite-store.test.ts
import { describe, expect, it } from "vitest";
import { SQLiteStore } from "./sqlite-store.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync } from "node:fs";

describe("SQLiteStore existence & persistence check", () => {
  it("correctly evaluates exists() returns true when key exists and false when missing", () => {
    const dbPath = join(tmpdir(), `test_sqlite_${Date.now()}.db`);
    const store = new SQLiteStore(dbPath);

    try {
      expect(store.exists("test_key")).toBe(false);

      store.write("test_key", { name: "hachimi" });
      expect(store.exists("test_key")).toBe(true);

      const val = store.read("test_key");
      expect(val).toEqual({ name: "hachimi" });
    } finally {
      store.close();
      try {
        unlinkSync(dbPath);
      } catch (e) {
        /* ignore */
      }
    }
  });
});
