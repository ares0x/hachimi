/**
 * Core type definitions for Hachimi Harness
 */

/** Unique identifier for a conversation / session */
export type SessionId = string;

/** Unique identifier for a user (can be local or channel-specific) */
export type UserId = string;

/** 已知的核心 Channel 标识符（仅用于编辑器自动补全） */
export type KnownChannelType = "cli" | "desktop" | "api" | "telegram" | "system";

/** 开放式 Channel 类型：核心作为不透明字符串处理，各渠道自定义扩展 */
export type ChannelType = KnownChannelType | (string & {});

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
  tool_calls?: ToolCall[];
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

/** 工具与技能的统一风险防护等级 */
export type ToolPermission = "safe" | "needs_confirm" | "dangerous";

/** Skill definition (Lazy by design) */
export interface SkillDefinition {
  name: string;
  description: string; // Short one-liner shown in system prompt
  /** Path or loader that returns the full skill content when activated */
  load: () => SkillContent | Promise<SkillContent>;
  tags?: string[];
  permission?: ToolPermission;
}

export interface SkillContent {
  instructions: string;
  tools?: string[]; // tool names this skill uses
  examples?: string[];
  requiredConfirmation?: boolean;
}

/** Tool definition */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
  permission?: ToolPermission;
  /** Whether this tool needs human approval before execution */
  requiresApproval?: boolean;
}

export interface ToolContext {
  sessionId: SessionId;
  userId: UserId;
  channel: ChannelType;
  memory: MemoryAccess;
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
  chatStream?(
    messages: Message[],
    tools?: ToolDefinition[],
    onChunk?: (chunk: string) => void
  ): Promise<LLMResponse>;
}

export interface ProviderTransportConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  customHeaders?: Record<string, string>;
  extraParams?: Record<string, unknown>;
}

export interface ProviderTransport extends LLMProvider {
  readonly id: string;
  readonly name: string;
  chat(
    messages: Message[],
    tools?: ToolDefinition[],
    config?: Partial<ProviderTransportConfig>
  ): Promise<LLMResponse>;
  chatStream(
    messages: Message[],
    tools?: ToolDefinition[],
    config?: Partial<ProviderTransportConfig> | ((chunk: string) => void),
    onChunk?: (chunk: string) => void
  ): Promise<LLMResponse>;
}

export interface Session {
  id: string;
  title?: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}
