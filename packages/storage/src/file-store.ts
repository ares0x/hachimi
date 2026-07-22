import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import type { JsonFileStore, JsonDirStore } from "./types.js";
import { log } from "@hachimi/shared";

export class FileJsonStore implements JsonFileStore {
  read<T>(path: string, fallback: T): T {
    try {
      if (!existsSync(path)) return fallback;
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw) as T;
    } catch (err) {
      log("warn", `读取失败: ${path}`, err);
      return fallback;
    }
  }

  write<T>(path: string, data: T): void {
    try {
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      log("error", `写入失败: ${path}`, err);
      throw err;
    }
  }

  exists(path: string): boolean {
    return existsSync(path);
  }
}

export class FileDirStore implements JsonDirStore {
  ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  list(dir: string): string[] {
    try {
      if (!existsSync(dir)) return [];
      return readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch (err) {
      log("warn", `列举目录失败: ${dir}`, err);
      return [];
    }
  }

  read<T>(filePath: string): T | null {
    try {
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, "utf-8")) as T;
    } catch (err) {
      log("warn", `读取失败: ${filePath}`, err);
      return null;
    }
  }

  write<T>(filePath: string, data: T): void {
    const dir = dirname(filePath);
    this.ensureDir(dir);
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  remove(filePath: string): void {
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch (err) {
      log("warn", `删除失败: ${filePath}`, err);
    }
  }
}
