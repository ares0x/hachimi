/** 通用 JSON 文档存储（单文件） */
export interface JsonFileStore {
  read<T>(path: string, fallback: T): T;
  write<T>(path: string, data: T): void;
  exists(path: string): boolean;
}

/** 目录型存储（多个 JSON 文件，如 sessions） */
export interface JsonDirStore {
  ensureDir(dir: string): void;
  list(dir: string): string[]; // 文件名
  read<T>(filePath: string, fallback?: T): T | null;
  write<T>(filePath: string, data: T): void;
  remove(filePath: string): void;
}

export interface StorageBackend {
  close?(): void;
}
