// packages/core/src/index.ts

export type { CompletionRequirement, StreamEvent } from "./agent/agent.js";
export { Agent } from "./agent/agent.js";
export {
  type AutoModelRoute,
  type AutoModelRoutingConfig,
  classifyRequestComplexity,
  type ModelTier,
  type RequestComplexity,
  resolveAutoModelRoute,
} from "./agent/auto-model-router.js";
export { MockLLMProvider } from "./agent/llm.js";
export { createLLMFromConfig } from "./agent/llm-factory.js";
export { AnthropicProviderTransport } from "./agent/providers/anthropic.js";
export {
  FailoverLLMProvider,
  isRetryableError,
  withExponentialBackoff,
} from "./agent/providers/failover.js";
export type { OpenAICompatibleConfig } from "./agent/providers/openai-compatible.js";
export { OpenAICompatibleProvider } from "./agent/providers/openai-compatible.js";
export type { ProviderType } from "./agent/providers/transport.js";
export { ProviderRegistry } from "./agent/providers/transport.js";
export type { SubAgentResult, SubAgentRunOptions, SubAgentTaskState } from "./agent/sub-agent.js";
export { SubAgentDelegator } from "./agent/sub-agent.js";
export type { BuiltContext, ContextBuildInput } from "./context/builder.js";
export { ContextBuilder } from "./context/builder.js";
export { PersonalContextLoader } from "./context/personal-context.js";
// W0: RuntimeEvent 事件存储
export type { EventListOptions, EventListResult, IEventStore } from "./events/event-store.js";
export { FileEventStore } from "./events/file-event-store.js";
export * from "./extensions/connector.js";
export * from "./extensions/contributor.js";
export * from "./extensions/index.js";
export * from "./extensions/mcp-builtin/index.js";
export type { GithubSkillSource, ParsedSkillFrontmatter } from "./extensions/skill-package.js";
export {
  installSkillsFromGitHub,
  parseSkillMarkdown,
  SkillPackageLoader,
} from "./extensions/skill-package.js";
// P2.1: Goal 模式（状态机 + 编排器 + 质疑者验证）
export {
  GOAL_BACKOFF_MS,
  GOAL_DEFAULT_MAX_RUNS,
  GOAL_DEFAULT_REVIEWERS,
  GOAL_STALL_THRESHOLD,
  GoalMachine,
  type GoalMachineState,
  type GoalPauseReason,
  type GoalPhase,
  type GoalVerdict,
  gapFingerprint,
} from "./goal/goal-machine.js";
export {
  GoalRunner,
  type GoalRunnerDeps,
  type GoalStartInput,
  type GoalTaskState,
  parseVerdict,
} from "./goal/goal-runner.js";
export type { AutoDreamGateOptions, DreamDecision } from "./memory/autodream.js";
export { AutoDreamGate } from "./memory/autodream.js";
export * from "./memory/index.js";
export type { MemdirIndexEntry } from "./memory/memdir.js";
export { MemdirStore } from "./memory/memdir.js";
export * from "./portable/index.js";
export { canonicalizeRoot, ProjectManager, projectIdForRoot } from "./project/manager.js";
// V1.2: 项目实体与 ProjectManager
export type {
  CreateProjectResult,
  Project,
  ProjectGitInfo,
  ProjectSummary,
} from "./project/types.js";
// P1.4: Replay 基准（事件轨迹投影 + 套件评估 + 基线回归）
export * from "./replay/index.js";
// P2.6: Rewind — 文件历史快照（事件 + 磁盘内容 + 纯函数重建链）
export {
  captureBeforeFileHistory,
  FILE_HISTORY_MAX_SNAPSHOTS,
  FileHistoryStore,
  type FileSnapshotInput,
  rebuildSnapshotChain,
  type SnapshotChain,
  type SnapshotMode,
  type SnapshotRecord,
} from "./rewind/file-history.js";
// Run: Durable run ledger for crash recovery
export { AgentRunStore } from "./run/agent-run-store.js";
export type { AgentRun, AgentRunSummary, RunFailureClass, RunStatus } from "./run/index.js";
export * from "./runtime/index.js";
export type { PathJailOptions } from "./sandbox/path-jail.js";
export { PathJail } from "./sandbox/path-jail.js";
export type { ISandboxOptions } from "./sandbox/sandbox.js";
export { ToolSandbox } from "./sandbox/sandbox.js";
export {
  isUntrustedTool,
  wrapToolResultIfUntrusted,
  wrapUntrustedContent,
} from "./security/untrusted-content.js";
export type {
  SessionInterruption,
  SessionInterruptionKind,
} from "./session/interruption.js";
export {
  classifySessionInterruption,
  interruptionHint,
} from "./session/interruption.js";
export { SessionManager } from "./session/manager.js";
export type { SessionRecoveryReport, SessionRecoveryStatus } from "./session/recovery.js";
export { recoverSession } from "./session/recovery.js";
export * as builtinSkills from "./skills/builtin/index.js";
export type { SkillDraft, SkillProposal, TrajectoryTurn } from "./skills/experience-extractor.js";
export { SkillProposalManager, TrajectoryCompressor } from "./skills/experience-extractor.js";
export { SkillRegistry } from "./skills/registry.js";
export {
  getProjectSkillsDir,
  getUserSkillsDir,
} from "./skills/skill-paths.js";
export type { SkillProposalCandidate } from "./skills/trajectory-compressor.js";
export type { ActivityPolicyOptions, HostPowerState } from "./tasks/activity-policy.js";
export { ActivityPolicy } from "./tasks/activity-policy.js";
export type { BackgroundTask, BackgroundTaskStatus } from "./tasks/background-task-manager.js";
export { BackgroundTaskManager } from "./tasks/background-task-manager.js";
// P2.2: DAG 任务编排（spec 解析 / 拓扑调度 / 输出插值 / run-log）
export {
  type DagNodeResult,
  type DagNodeStatus,
  type DagRunInput,
  DagRunner,
  type DagRunnerDeps,
  type DagRunResult,
  type DagRunTaskState,
  interpolateNodeOutput,
} from "./tasks/dag-runner.js";
export {
  type DagNodeSpec,
  type DagSpec,
  normalizeSpec,
  parseDagSpec,
  parseMiniYaml,
  validateDagSpec,
} from "./tasks/dag-spec.js";
export type { TaskKind, TaskState, TaskStateBase, TaskStatus } from "./tasks/task-registry.js";
export { TaskRegistry } from "./tasks/task-registry.js";
export type { RememberedGrant } from "./tools/grant-store.js";
export { extractCommandPrefix, GrantStore } from "./tools/grant-store.js";
export type { PolicyLevel, SurfaceType, ToolPolicyRule } from "./tools/policy.js";
// W2.1: 权限策略矩阵
export {
  defaultPermissionPolicy,
  PermissionPolicy,
  type SessionTrustLevel,
} from "./tools/policy.js";
export { ToolRegistry } from "./tools/registry.js";
export type { PermissionRules, RuleDecision } from "./tools/rule-engine.js";
export {
  DEFAULT_DANGEROUS_COMMAND_PREFIXES,
  matchWildcard,
  PermissionRuleEngine,
} from "./tools/rule-engine.js";
export type { TriggerTask } from "./triggers/scheduler.js";
export { ProactiveScheduler } from "./triggers/scheduler.js";
export type { LLMProvider, LLMResponse } from "./types/index.js";
export * from "./types/index.js";
export * from "./usage/usage-summary.js";
export * from "./vision/index.js";
export type { CreateWorkOptions, ListWorksOptions } from "./work/work-manager.js";
// W1: Work 数据模型与 WorkManager
export { WorkManager } from "./work/work-manager.js";
