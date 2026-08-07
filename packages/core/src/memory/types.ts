import type { MemoryLayer } from "../types/index.js";

export interface MemorySearchOptions {
  layers?: MemoryLayer[];
  limit?: number;
  minImportance?: number;
}
