# Development Roadmap

Revision 4. Updated following Phase H (H1 & H2) Harness Core Reinforcement, SubAgent Hardening, and Channel Approval Policy.

Each phase must leave the project runnable and testable, and closes with a short review before the next one starts.

## Phase A — Foundation (Done)
- [x] Monorepo structure (`apps/`, `packages/`)
- [x] `@hachimi/config`, `@hachimi/storage` (file-backed), `@hachimi/shared`
- [x] Agent loop with tool-calling, single-turn blocking execution
- [x] Four-layer memory (working/session/long_term/archival), file-persisted
- [x] Session manager (separate from memory)
- [x] Lazy skill registry (description in prompt, full content on activation)
- [x] Tool registry with permission gate (`safe`/`needs_confirm`/`dangerous`)
- [x] TUI channel (readline-based, embedded mode)
- [x] Vitest coverage for agent/memory/session/permissions

## Phase B — Fix the Foundation Before Building On It (Done)
- [x] **B1 — Unify permission types.** Collapse `PermissionLevel` and `ToolPermission` into one type.
- [x] **B2 — Prompt-cache-stable `ContextBuilder`.** Fixed prefix (identity/tools/skill-descriptions), variable content after a clear boundary. Tail-only trimming.
- [x] **B3 — Memory retrieval v2.** Embedding-based similarity search in `MemoryManager.search()`.
- [x] **B4 — Skill activation via model-chosen tool.**
- [x] **B5 — Harden consolidation.** Reliable deduplication and pruning.

## Phase C — Provider Abstraction + Runtime Topology (Done)
- [x] **C1 — `ProviderTransport` interface.** OpenAI, DeepSeek, Anthropic transports.
- [x] **C2 — Embedded-mode non-interactive entry.**
- [x] **C3 — SDK export from `@hachimi/core`.** `createAgentSession()`-style programmatic entry.
- [x] **C4 — Daemon mode: `apps/server` becomes real.** HTTP/WS API server holding canonical `@hachimi/core` instance.
- [x] **C5 — Minimum transport auth.** Local secret token gating daemon API.
- [x] **C6 — Mid-turn steering (steer & followUp).**
- [x] **C7 — Minimum tool-execution sandbox.** `ToolSandbox` timeout & buffer cap.

## Phase D — Portable Memory (Done)
- [x] **D1 — Versioned bundle format.**
- [x] **D2 — Export command.**
- [x] **D3 — Import command with merge semantics.**
- [x] **D4 — Schema migration path.**

## Phase E — Unified Extension Registry (Done)
- [x] **E1 — `CapabilitySource` refactor.**
- [x] **E2 — Skills as installable packages.**
- [x] **E3 — Hooks.** `onPreToolCall` / `onPostToolCall` / `onSessionStart`.
- [x] **E4 — MCP client integration.**

## Phase F — Multi-Surface Clients & SubAgent Hardening (In Progress)
- [x] **F2 — Telegram Bot Gateway.**
- [x] **F3 — Web UI Client.**
- [x] **F4 — Sub-agent delegation & Hardening (F4-harden).** Async 50ms non-blocking mode, sub-agent recursion prevention, worker system prompt, resource turn budget.
- [ ] **F5 — Skill-from-experience extraction.** TrajectoryCompressor + SkillProposalManager with human confirm.
- [ ] **F6 — Scheduled/proactive triggers.** ProactiveScheduler background timer/cron.

## Phase H — Harness Core Hardening & Reinforcement (In Progress / Closing H2)
- [x] **H1.1 — Unified `createAgentSession` / Composition Root.** TUI, CLI, Daemon all assemble via `@hachimi/core` public exports.
- [x] **H1.2 — Core Public API Surface Freezing.** Package `"exports"` enforcement and [`docs/API.md`](file:///Users/jace/workspace/Code/Node/Personal/hachimi/docs/API.md) documentation.
- [x] **H1.3 — Single Configuration Path.** Single `activeProvider` resolution path; legacy fields deprecated.
- [x] **H1.4 — Automated CI & Smoke Test.** `.github/workflows/ci.yml` and `pnpm smoke:mock`.
- [x] **H1.5 — Error Boundaries & Exception Protection.** `HarnessRuntime.execute()` try-catch error isolation.
- [x] **H1.6 — Daemon Request ID Tracking.** `x-request-id` header & log context correlation.
- [x] **H2.1 — ContextBuilder Contract & Lock Test.** Lock prefix sequence `Identity -> Skills -> Tools -> Dynamic` and tail-only truncation.
- [x] **H2.2 — Unified Tool Execution Pipeline.** 5-step pipeline for all permission levels with uniform 30s timeout cap.
- [x] **H2.3 — Tri-Level Permission Consistency.** Full-path approval pipeline & `tests/core/permission-matrix.test.ts`.
- [x] **H2.4a/b — Sandbox Hardening.** 30s timeout, 1MB buffer cap, env scrubbing (`scrubEnv`), `PathJail` workspace jail.
- [x] **H2.5 — Self-Correction & Circuit Breaker.** 1-retry model feedback on tool failure; 3-consecutive-failure circuit breaker.
- [x] **H2.6 — Lifecycle Hooks Loop Integration.** `onSessionStart`, `onPreToolCall`, `onPostToolCall` wired into Agent loop with counter tests.
- [x] **H2.7 — MCP Tool Alignment & Failure Isolation.** MCP tools share pipeline; bad MCP failures isolated without crashing loop.
- [x] **H2.8 — Channel Approval Policies (`channelPolicy`).** Fallback handler (`deny` / `allow-safe` / `allowlist`) for headless channels.
- [x] **H2.9 — System Local Time Context Injection.** Local date & time in `ContextBuilder` dynamic region + builtin `get_current_datetime` tool.

## Phase I — Agent Capability Evaluation Framework (Evals) (Done)
- [x] **I1.1 — Representative Eval Benchmarks.** 5 core capability domains: `tool_calling`, `multi_turn_reasoning`, `memory_retrieval`, `subagent_delegation`, `safety_jail`.
- [x] **I1.2 — Tri-Tier Evaluator Graders.** `DeterministicGrader`, `StateGrader`, and `LLMJudgeGrader`.
- [x] **I1.3 — Dual-Mode EvalRunner.** Supports Mock Mode (CI zero cost regression) and Live LLM Mode.
- [x] **I1.4 — Metrics & Reporter.** `EvalReporter` formatted summary output with Pass Rate %, Avg Latency (ms), and Avg Tokens.

## Web/Desktop MVP (Done)
- [x] **MVP.1 — Web SPA.** Vite+React web client with session management, streaming chat, Markdown rendering (tables, HR).
- [x] **MVP.2 — Desktop Shell.** Electron wrapper with native title bar and window icon.
- [x] **MVP.3 — Brand Assets.** Logo/mark integrated into web favicon, desktop icon, sidebar, and README.

## Phase W — Runtime Native → Work-first → 可恢复、可策略、可演化 (Active)

> See [`docs/TASK.md`](./TASK.md) for detailed task breakdown and [`docs/MOVE.md`](./MOVE.md) / [`docs/PHASE.md`](./PHASE.md) for design rationale.

- [x] **W0 — Execution Truth Source & Recoverability (P0).** `RuntimeEvent` type system, append-only JSONL event store, session recovery after process restart, `GET /api/sessions/:id/events`.
- [x] **W1 — Work as First-Class Citizen (P0).** `Work` data model (title/goal/status/plan), auto title generation, Plan steps, Activity projection from events, full Works REST API.
- [x] **W2 — Policy Engine & Production Defaults (P0).** `surface × toolClass` permission matrix, explicit approve/deny API (`POST /api/tools/approve`), auto API secret generation, CORS whitelist.
- [x] **W3 — Work-first UI Minimal Set (P1).** Rail replaces Session list, idle intent chips, Goal/Plan/Activity main area, Composer anchored to Work, PermissionDock approval.
- [ ] **W4 — Evolution Loop F5 (P1).** `TrajectoryCompressor` from completed Work events, `SkillProposalManager` with human-confirm gate, learned skills written to registry.
- [ ] **W5 — Context Governance & Eval Hardening (P1).** W5.1 tool_result size cap + truncation (Done), W5.2 compaction, W5.3 eval cases.
- [ ] **W6 — Connectors (Optional P2).** `IConnector` interface, local ICS / Google Calendar read-only tool, capability surface in Inspector.

