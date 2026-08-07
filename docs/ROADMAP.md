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
- [x] **F5 — Skill-from-experience extraction.** TrajectoryCompressor + SkillProposalManager with human confirm (landed via W4).
- [ ] **F6 — Scheduled/proactive triggers.** ProactiveScheduler background timer/cron.

## Phase H — Harness Core Hardening & Reinforcement (In Progress / Closing H2)
- [x] **H1.1 — Unified `createAgentSession` / Composition Root.** TUI, CLI, Daemon all assemble via `@hachimi/core` public exports.
- [x] **H1.2 — Core Public API Surface Freezing.** Package `"exports"` enforcement and public-API-only import rules (see `AGENTS.md` §2 "Public API Only").
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

## Phase W — Personal Agent Runtime Convergence & Work-First Harness (Done)

> See [`docs/VISION.md`](./VISION.md) / [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) for design rationale.

- [x] **W0 — Execution Truth Source & Recoverability (P0).** `RuntimeEvent` type system, append-only JSONL event store, session recovery after process restart, `GET /api/sessions/:id/events`.
- [x] **W1 — Work as First-Class Citizen (P0).** `Work` data model (title/goal/status/plan), auto title generation, Plan steps, Activity projection from events, full Works REST API.
- [x] **W2 — Policy Engine & Production Defaults (P0).** `surface × toolClass` permission matrix, explicit approve/deny API (`POST /api/tools/approve`), auto API secret generation, CORS whitelist.
- [x] **W3 — Work-first UI Minimal Set (P1).** Rail replaces Session list, idle intent chips, Goal/Plan/Activity main area, Composer anchored to Work, PermissionDock approval.
- [x] **W4 — Evolution Loop F5 (P1).** `TrajectoryCompressor` from completed Work events, `SkillProposalManager` with human-confirm gate, learned skills written to `~/.hachimi/skills/`.
- [x] **W5 — Context Governance & Eval Hardening (P1).** W5.1 tool_result 8KB size cap + truncation, W5.2 rule-based compaction (>30 rounds), W5.3 3 new eval cases (`work_recovery`, `permission_deny`, `plan_then_act`), W5.4 ARCHITECTURE.md updates.
- [ ] **W6 — Connectors (Optional P2).** `IConnector` interface, local ICS / Google Calendar read-only tool, capability surface in Inspector.

## Phase J — Harness Completeness: Recovery, Plan Mode, Background Tasks, Permission Rules, ACP (Done)

P0/P1 harness-completeness pass. Every item keeps execution truth in `RuntimeEvent` and routes through
`HarnessRuntime.execute()` — no channel bypasses policy, jail, or the event store.

- [x] **J1 — Session Recovery Pipeline (P0).** `recoverSession()` rebuilds sessions from the event stream when the session file is missing or messages were dropped; `HarnessRuntime.execute()` auto-recovers on first load; CLI `hachimi session list/show/recover/resume` + `-r/--resume`, `-c/--continue`.
- [x] **J2 — Plan Mode (P0).** `plan_mode_changed` event + Activity projection; `enter_plan_mode` / `exit_plan_mode` tools (`needs_confirm`); `ToolRegistry.isPlanModeAllowed()` gates write tools before argument validation; `SessionManager.getMode/setMode` persists `metadata.mode`.
- [x] **J3 — Background Tasks (P0).** `BackgroundTaskManager` spawns `/bin/sh -c` commands with output cap + env scrubbing; `run_command background:true`, `get_command_or_subagent_output`, `wait_commands_or_subagents`, `kill_command_or_subagent`.
- [x] **J4 — Permission Rules & Remembered Grants (P0).** `PermissionRuleEngine` deny>ask>allow wildcard rules + `dangerousCommands`; `GrantStore` project-level command-prefix grants (dangerous commands never remembered); `permissionRules` config round-trip.
- [x] **J5 — Export Redaction (P0).** `redactText`/`redactDeep` strip `sk-*`, Bearer, PEM, `key=value` secret shapes before portable-bundle export and checksum.
- [x] **J6 — ACP stdio Server (P1).** `@hachimi/channel-acp` JSON-RPC 2.0 over stdio (`initialize`, session lifecycle, `prompt`, `getMessages`, approval bridge, `shutdown`); reuses `HarnessRuntime.execute`; `pnpm dev:acp`.

## Phase K — Comparative Borrowing (P2 candidates, planned)

See [`docs/COMPARISON.md`](./COMPARISON.md) — six-project harness comparison
(Claude Code analysis, grok-build, maka-agent, pi, t3code, Kun) condensed into a
prioritized borrowable backlog. First wave delivered:

- [x] **K1 — Recovery classification (B1).** `classifySessionInterruption` +
  `interruptionHint`; `SessionRecoveryReport.interruption`; surfaced in `hachimi
  session show/recover` (waiting_approval / tool_interrupted /
  stream_interrupted / error / cancelled).
- [x] **K2 — Untrusted-content tagging (B2).** `<untrusted-content>` wrapper at
  the context seam for web / MCP tool results (`ContextBuilder`), keeping raw
  results untagged in events/Activity.
- [x] **K3 — Stream watchdog (B5).** `withStreamWatchdog` connect/idle timeouts
  (30s/120s) around streaming model calls; permission waits naturally excluded;
  `StreamWatchdogError` reaches the harness error boundary.
- [x] **K4 — Memory clear CLI (B9).** `hachimi memory clear [--memories|--sessions|--all] [--yes]`
  with confirmation, scoped deletion of `memory.json` + SQLite memories and
  `sessions/*.json` + `events/*.jsonl`; logic in `memory-clear.ts` (tested).

- [x] **K5 — Usage summary (B8).** Provider transports now capture `usage`
  (OpenAI-compatible `data.usage`; Anthropic `message_start`/`message_delta`);
  `Agent` reports per-call usage via `onUsage`; `HarnessRuntime` writes it into
  `run_finished` events (+ `model`) and `RuntimeOutput.usage`; `hachimi usage
  [--days N|--all]` aggregates tokens / cost / tools / models from the event
  stream (`usage-summary.ts`, pure + tested).
- [x] **K6 — Auto model routing (B6).** `resolveAutoModelRoute` classifies each
  turn (simple → fast tier, complex → pro tier, ambiguous → keep default) with
  deterministic heuristics and reasoning-effort routing; opt-in via
  `agent.autoModelRouting` (fast/pro model ids or keyword matching); model is
  passed per-call through the transport config (`auto-model-router.ts`, tested).
- [x] **K7 — Tool gating `load_tools` (B3).** `ToolDefinition.group` +
  `ToolRegistry.setToolGating/loadToolGroup/listGroups`; gated groups are hidden
  from the advertised tool list and rejected at execute() until activated;
  `load_tools` builtin (safe, always advertised); opt-in via
  `agent.toolGating` (`defaultGroups` pre-activation). Activation state is
  in-process only for now — cross-process re-seeding from events is future work.

## Phase L — Desktop Productization

Harness-completeness conclusion (Phase K): the core loop, recovery, policy,
context governance, observability, and cost controls are in place. The remaining
backlog items are either desktop-coupled (notifications, power awareness,
incognito surfacing) or deferrable protocols (turn-diff, ACP client, branching).
They move into the Desktop phase as enablers, not new product centers.

Desktop today: Electron shell auto-spawns the daemon and renders the shared SPA
(folder picker is the only other native capability). Design intent: turn the
Desktop surface from a thin web-shell into a mature local workbench while
preserving the architecture red lines (single brain, thin projections, truth in
`RuntimeEvent`, everything through `HarnessRuntime.execute()`). Prioritized
backlog:

- [~] **L1 — Desktop P0 foundation.** Shipped (Aug 2026): daemon lifecycle
  hardening (port conflict + fallback port, single-instance, close-to-tray),
  tray menu (Works / Tasks / Approvals / Quit) + dock badge, native
  notifications (task finished / approval waiting, main-process polling),
  global shortcut `Cmd/Ctrl+Shift+H`, background-task panel (J3 surfacing via
  `GET /api/tasks` + kill), usage/cost panel (`GET /api/usage` + UI),
  cross-session search (`GET /api/search` + palette), approvals panel
  (`GET /api/approvals`), approval diff viewer (D7, live SSE diff). Remaining
  within L1 closed (Aug 2026): approval "remember" via GrantStore auto-grant,
  stale-approval timeout banner, message actions (copy / regenerate), keyboard
  navigation (`Cmd+N`, `Cmd+1..9`, `Cmd+/` help, `Cmd+Shift+I` incognito).
  Remaining: packaged production daemon mode.
- [~] **L2 — Desktop P1 trust & memory.** Shipped: incognito per-Work
  (`Work.metadata.incognito`, no memory writes), memory viewer/editor, audit-log
  view, permission-rules editor, daemon-offline recovery screen. Remaining:
  onboarding wizard, recent projects + attach folder to Work, ContextPanel
  upgrades (compaction status, routed model, incognito indicator).
- [ ] **L3 — Desktop P2 polish.** Power/thermal pause of background tasks (B11),
  turn-diff incremental sync (B12), drag-drop/clipboard attachments,
  multi-window Works, auto-update + opt-in crash reporting, ACP client (B13,
  optional), branch UI (B14, after harness branch storage).

Remaining non-desktop P2 tracks: typed compaction with archived tool results
(B4), W6 connector surfacing (ICSConnector → tool registry), F6 proactive
trigger wiring (scheduler → channel push).

## Phase M — Credential Store & Skills Ecosystem

Local-first secrets and an installable skills surface, borrowing the typed-kind
credential model from maka-agent, Claude Code's secure-storage layering, and
Kun's GitHub skill-import pipeline.

### M1 — Credential Store (Done, Aug 2026)
- [x] **M1.1 — Typed credential kinds.** `credentials.json` schema v2 keyed
  `slug:kind` (`api_key` / `bot_token` / `app_secret` / `proxy_password` /
  `oauth_token` / `env_secret`); v1 connection-key files migrate on load;
  legacy `get/set/has/delete(connectionId)` API preserved.
- [x] **M1.2 — Cross-process write lock.** Atomic-mkdir lockfile (never stolen,
  fail-loud with recovery instructions) so daemon / CLI / desktop writers can't
  lose each other's updates; every mutation re-reads the file under the lock.
- [x] **M1.3 — At-rest hardening.** 0700 secret dir, 0600 O_EXCL temp + atomic
  rename; unreadable files are backed up (`credentials.json.corrupt-*`) instead
  of silently destroyed; optional `SecretCipher` hook (Electron `safeStorage`)
  ready for desktop at-rest encryption (plaintext-0600 remains the headless
  default, maka parity).
- [x] **M1.4 — Consumers wired.** Web-search provider keys (`api_key:tavily` /
  `brave` / `exa` / `serper`) resolve from the store before env vars; Telegram
  bot token moves to `bot_token:telegram`; MCP servers support
  `envCredentials` (`env var → slug:kind` refs, resolved at startup).
- [x] **M1.5 — API + UI.** `GET/PUT/DELETE /api/credentials` (masked previews,
  values never returned); Settings 「凭据与密钥」tab with list / quick-add /
  add modal / delete.

### M2 — Skills Ecosystem (Done, Aug 2026)
- [x] **M2.1 — Rich skill metadata.** `SkillDefinition` gains version, license,
  author, homepage, allowedTools, priority, triggers, source, sourceDir; YAML-ish
  frontmatter parser supports inline + dash lists and `tools → allowedTools`.
- [x] **M2.2 — Directory unification.** Shared `skill-paths` (user
  `~/.hachimi/skills`, project `<cwd>/.hachimi/skills`); project skills take
  precedence over user (claude-code / codex convention); fixed `open-folder` and
  path display that previously pointed at the wrong `dataDir/skills` folder.
- [x] **M2.3 — Skill management.** `SkillPackageLoader` gains create / update /
  delete and `installSkillsFromGitHub` (repo / tree / blob URLs, `skills/`
  folder auto-discovery, frontmatter parsing, name dedup).
- [x] **M2.4 — API + UI.** `POST /api/skills/install` (GitHub), `POST /api/skills`
  (create), `PUT/DELETE /api/skills/:id`; GET returns source / version / author /
  license; registry reload after mutations; SkillsManager adds source badges,
  version chips, GitHub install, create / edit / delete, folder button.

### M3 — Remaining (Next)
- [ ] Desktop at-rest encryption via `SecretCipher` + Electron `safeStorage`
  (main-process IPC handshake; file-first 0600 stays the fallback).
- [ ] Skill marketplace browsing (registry of known skill repos, one-click
  install), skill update / upgrade detection, per-skill version pinning.
- [ ] Proposal review: edit instructions before accept, diff against builtin,
  approve-with-notes.
- [ ] TUI/CLI credential & skill commands (`hachimi credentials`, `hachimi
  skill install <url>`).
