// packages/core/src/portable/types.ts

export interface HachimiBundleMemoryItem {
  id: string;
  layer: "working" | "session" | "long_term" | "archival";
  content: string;
  importance: number;
  timestamp: number;
}

export interface HachimiBundleSessionItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Array<{
    id: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    timestamp: number;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
  }>;
}

export interface HachimiBundleV1 {
  schemaVersion: 1;
  createdAt: number;
  exportedBy: string;
  checksum: string;
  memory: {
    longTerm: HachimiBundleMemoryItem[];
    archival: HachimiBundleMemoryItem[];
  };
  sessions: HachimiBundleSessionItem[];
  skillsState?: {
    activeSkill?: string;
  };
}

export interface ExportBundleOptions {
  filePath?: string;
  exportedBy?: string;
}

export interface ImportBundleOptions {
  mergeStrategy?: "additive" | "overwrite";
}

export interface ImportBundleResult {
  success: boolean;
  importedMemoriesCount: number;
  importedSessionsCount: number;
  skippedMemoriesCount: number;
  checksumValid: boolean;
  migratedFromVersion?: number;
}
