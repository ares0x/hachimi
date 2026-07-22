/**
 * Core type definitions for Hachimi Harness
 */

/** Unique identifier for a conversation / session */
export type SessionId = string;

/** Unique identifier for a user (can be local or channel-specific) */
export type UserId = string;

/** Channel that the message originated from */
export type ChannelType =
  | "cli"
  | "desktop"
  | "api"
  | "telegram"
  | "wechat"
  | "slack"
  | "system";

/** A single message in the conversation */
export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentPart[];
  timestamp: number;
  channel?: ChannelType;
  metadata?: Record<string, unknown>;
  tool_call_id?: string;
  name?: string;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "tool_call"; tool_call: ToolCall }
  | { type: "tool_result"; tool_result: ToolResult };

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  is_error?: boolean;
}

/** Hierarchical memory layers */
export type MemoryLayer = "working" | "session" | "long_term" | "archival";

export interface MemoryEntry {
  id: string;
  layer: MemoryLayer;
  content: string;
  embedding?: number[];
  importance: number; // 0-1
  createdAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, unknown>;
}


/** Skill definition (Lazy by design) */
export interface SkillDefinition {
  name: string;
  description: string; // Short one-liner shown in system prompt
  /** Path or loader that returns the full skill content when activated */
  load: () => Promise<SkillContent>;
  tags?: string[];
}

export interface SkillContent {
  instructions: string;
  tools?: string[]; // tool names this skill uses
  examples?: string[];
}

/** Tool definition */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
  /** Permission level required */
  requiredPermission?: PermissionLevel;
  /** Whether this tool needs human approval before execution */
  requiresApproval?: boolean;
}

export type PermissionLevel = "none" | "read" | "write" | "network" | "system" | "dangerous";

export interface ToolContext {
  sessionId: SessionId;
  userId: UserId;
  channel: ChannelType;
  memory: MemoryAccess;
  // more context can be injected later
}

export interface MemoryAccess {
  getWorking: () => Promise<Message[]>;
  search: (query: string, layers?: MemoryLayer[]) => Promise<MemoryEntry[]>;
  add: (entry: Omit<MemoryEntry, "id" | "createdAt" | "lastAccessedAt">) => Promise<void>;
}

/** Incoming request from any channel */
export interface IncomingMessage {
  sessionId?: SessionId; // if omitted, create new
  userId: UserId;
  channel: ChannelType;
  content: string;
  attachments?: Array<{ type: string; url?: string; data?: Buffer }>;
  metadata?: Record<string, unknown>;
}

/** Outgoing response to channel */
export interface OutgoingMessage {
  sessionId: SessionId;
  content: string;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
}

export interface LLMResponse {
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface LLMProvider {
  chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}
