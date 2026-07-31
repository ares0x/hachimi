// packages/core/src/index.ts

export type { CompletionRequirement, StreamEvent } from "./agent/agent.js";
export { Agent } from "./agent/agent.js";
export { MockLLMProvider } from "./agent/llm.js";
export { createLLMFromConfig } from "./agent/llm-factory.js";
export { AnthropicProviderTransport } from "./agent/providers/anthropic.js";
export type { OpenAICompatibleConfig } from "./agent/providers/openai-compatible.js";
export { OpenAICompatibleProvider } from "./agent/providers/openai-compatible.js";
export type { ProviderType } from "./agent/providers/transport.js";
export { ProviderRegistry } from "./agent/providers/transport.js";
export type { SubAgentResult, SubAgentRunOptions, SubAgentTaskState } from "./agent/sub-agent.js";
export { SubAgentDelegator } from "./agent/sub-agent.js";
export type { BuiltContext, ContextBuildInput } from "./context/builder.js";
export { ContextBuilder } from "./context/builder.js";
// W0: RuntimeEvent 事件存储
export type { EventListOptions, EventListResult, IEventStore } from "./events/event-store.js";
export { FileEventStore } from "./events/file-event-store.js";
export * from "./extensions/index.js";
export * from "./extensions/contributor.js";
export * from "./extensions/mcp-builtin/index.js";
export * from "./memory/index.js";
export * from "./portable/index.js";
// Run: Durable run ledger for crash recovery
export { AgentRunStore } from "./run/agent-run-store.js";
export type { AgentRun, AgentRunSummary, RunFailureClass, RunStatus } from "./run/index.js";
export * from "./runtime/index.js";
export type { PathJailOptions } from "./sandbox/path-jail.js";
export { PathJail } from "./sandbox/path-jail.js";
export type { ISandboxOptions } from "./sandbox/sandbox.js";
export { ToolSandbox } from "./sandbox/sandbox.js";
export { SessionManager } from "./session/manager.js";
export * as builtinSkills from "./skills/builtin/index.js";
export type { SkillDraft, SkillProposal, TrajectoryTurn } from "./skills/experience-extractor.js";
export { SkillProposalManager, TrajectoryCompressor } from "./skills/experience-extractor.js";
export { SkillRegistry } from "./skills/registry.js";
export type { SkillProposalCandidate } from "./skills/trajectory-compressor.js";
export type { PolicyLevel, SurfaceType, ToolPolicyRule } from "./tools/policy.js";
// W2.1: 权限策略矩阵
export { defaultPermissionPolicy, PermissionPolicy } from "./tools/policy.js";
export { ToolRegistry } from "./tools/registry.js";
export type { TriggerTask } from "./triggers/scheduler.js";
export { ProactiveScheduler } from "./triggers/scheduler.js";
export type { LLMProvider, LLMResponse } from "./types/index.js";
export * from "./types/index.js";
export type { CreateWorkOptions, ListWorksOptions } from "./work/work-manager.js";
// W1: Work 数据模型与 WorkManager
export { WorkManager } from "./work/work-manager.js";
