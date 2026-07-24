// packages/core/src/extensions/capability.ts
import type { ToolDefinition } from "../types/index.js";

export type CapabilityType = "tool" | "skill" | "mcp";

/**
 * E1: 统一扩展能力源抽象契约 (CapabilitySource<T>)
 */
export interface CapabilitySource<T = ToolDefinition> {
  id: string;
  type: CapabilityType;
  list(): Promise<T[]> | T[];
  resolve?(name: string): Promise<T | undefined> | T | undefined;
}
