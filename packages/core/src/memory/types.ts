export type MemoryLayer = "working" | "session" | "long_term" | "archival";

export interface MemoryEntry {
  id: string;
  layer: MemoryLayer;
  content: string;
  importance: number; // 0~1，越高越重要
  createdAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchOptions {
  layers?: MemoryLayer[];
  limit?: number;
  minImportance?: number;
}
