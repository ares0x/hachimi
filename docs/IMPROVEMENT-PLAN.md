# Hachimi Harness Improvement Plan

Revision 1. This is the **implementation plan** companion to `COMPARISON.md`
(which says *what* to borrow). This document says *how* to change Hachimi:
concrete designs mapped to existing files, adaptation fit, performance impact,
and — where a change is breaking — the exact reason and migration path.

Sources (all already harvested in `COMPARISON.md`): `claude-code-analysis`,
`grok-build`, `maka-agent`, `pi`, `t3code`, `Kun`.

---

## 0. Principles

1. **Red lines unchanged** (per `AGENTS.md` / `VISION.md`): model-agnostic,
   local-first, events are truth, capability is mediated by policy. Every item
   below extends `Work` / `RuntimeEvent` / policy / tools — never a second loop.
2. **Incremental first**: new optional fields, new event types, new default-on
   tools beat changing semantics. When a breaking change is unavoidable, ship a
   migration path and keep reading old data valid.
3. **Performance budget**: prefer cached/O(1) checks over re-parsing; failure
   paths use backoff, never hot loops; writes batch and flush; token-heavy
   paths archive instead of inlining.
4. Each item lists: source, where it lands in the repo, adaptation fit,
   performance impact, and breaking-ness.

Legend: **P0** low-risk high-yield · **P1** completeness backbone ·
**P2** differentiation. Breaking = schema/semantics/API change with migration.

---

## 1. Phase P0 — Low-risk, high-yield (mostly additive)

### P0.1 — Bash command segmentation (`shell-ast-guard.ts`)

- **Source**: grok `bash_command_splitting.rs`; Claude Code bash permission chain.
- **Design**: extend `auditShellCommandAST` (currently tokenize + destructive-rm
  detection only) into a layered audit:
  1. strip leading wrappers (`timeout`, `env FOO=bar`, `nice`, `sudo -n`);
  2. detect `bash -c '...'` / `sh -c '...'` and recurse into the inner script;
  3. nesting depth >= 8 → fail-closed to `Ask`;
  4. each layer still runs the existing destructive-rm / audit rules.
  Wire it into `run_command`'s `checkPermissions` path so both the registry gate
  and the policy layer see the same verdict.
- **Adaptation fit**: high — pure function on the command string, no I/O.
- **Performance**: O(n) single parse per command; optional memoization keyed by
  command hash (bounded LRU, e.g. 256 entries).
- **Breaking**: none. Strictly more conservative; a few previously-allowed
  nested commands will now require approval (documented, security direction).

### P0.2 — MCP crash-restart + liveness (`extensions/mcp-client.ts`)

- **Source**: grok `mcp_restart.rs` (managed pool, liveness, crash restart).
- **Design**: `McpClientManager` gains per-server state:
  - consecutive call failures → mark `degraded`, hide/flag its tools from the
    model manifest, exponential backoff restart (1s→2s→4s… cap 30s);
  - background liveness ping (30s) on idle stdio/SSE servers; on success,
    re-run `listTools()` and re-advertise;
  - keep the existing failure isolation (bad MCP never aborts the loop).
- **Adaptation fit**: high — MCP tools already share the tool pipeline (H2.7).
- **Performance**: zero on the happy path; backoff prevents restart storms.
- **Breaking**: none.

### P0.3 — Compaction circuit breaker (`context/builder.ts`)

- **Source**: Claude Code `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES`.
- **Design**: `ContextBuilder` tracks consecutive `compactHistoryBlock`
  failures (throw / budget overshoot). After 3, the session stops auto-compacting
  and injects a `<system-reminder>` context-pressure note instead; manual
  compact stays available. Reset on success.
- **Adaptation fit**: high — pure state in the builder; per-session map.
- **Performance**: O(1) counter.
- **Breaking**: none.

### P0.4 — Event traceability: `correlationId` / `parentEventId` + `checkpoint` event

- **Source**: t3code event headers (`commandId/causationEventId/correlationId`);
  pi tree entries (`parentId/leafId`).
- **Design**:
  ```ts
  interface BaseRuntimeEvent {
    id: string; sessionId: string; timestamp: string; seq?: number;
    /** One user input or one run shares a correlationId (audit + UI grouping) */
    correlationId?: string;
    /** Causal parent (subagent result ← tool call, checkpoint ← turn …) */
    parentEventId?: string;
  }
  ```
  `HarnessRuntime.execute()` generates one `correlationId` per run and threads it
  through `events.append`. New event type `checkpoint` (kind: `fs|work|git|memory`,
  label, ref) seeds the future rewind path (P2.6). No existing event changes.
- **Adaptation fit**: high — additive optional fields; projections ignore them.
- **Performance**: two short strings per event, negligible.
- **Breaking**: **minor** — see §4.1.

---

## 2. Phase P1 — Completeness backbone

### P1.1 — Post-compact state compensation (four-part checklist)

- **Source**: Claude Code `compact.ts` state re-injection (files in flight,
  active plan, active skills, deferred tool deltas).
- **Design**: `ContextBuilder` already re-injects explored files (W5/P3). Extend
  the compacted block with: active plan (from Work/`plan_mode_changed`),
  activated skill (from `SkillRegistry.activeSkill`), and deferred/loaded tool
  groups (from `ToolRegistry.getActivatedGroups()`). Emit one compacted
  "state snapshot" block instead of three ad-hoc injections.
- **Adaptation fit**: high — all three sources already exist in the runtime.
- **Performance**: only on compaction; bounded (≤15 files / one plan / one
  skill / group list).
- **Breaking**: none.

### P1.2 — Immutable-prefix fingerprinting

- **Source**: Kun `immutable-prefix.ts` + `PROMPT_TOKEN_TRUST_FACTOR`.
- **Design**: `ContextBuilder.build()` fingerprints the stable prefix
  (identity → skills → tools, per the locked B2 order) with sha256 + revision.
  When the fingerprint changes between turns (skills/tools changed), log and
  optionally inject a cache-invalidation hint. Add a token-trust factor: when a
  provider reports `cache_read` tokens exceeding a sane ratio of prompt tokens,
  normalize the count so the context never pins at 100% (MiniMax-style misreport).
- **Adaptation fit**: high — pure addition to the existing builder.
- **Performance**: one sha256 per build (~µs), cached by prefix length.
- **Breaking**: none.

### P1.3 — Sub-agent sidechain persistence

- **Source**: Claude Code subagent sidechain JSONL; Kun orphan recovery.
- **Design**: sub-agent runs write an append-only sidechain under
  `data/subagents/{subSessionId}.jsonl` (assistant / tool_call / tool_result
  subset). On recovery, `SessionManager` / recovery scans the directory and
  rebuilds task state (status, summary, duration); `agent_output` reads from the
  sidechain when memory state is gone. Orphaned `queued/running` records from a
  previous process are marked `failed` on boot (Kun pattern).
- **Adaptation fit**: medium-high — sub-agent already emits a `subSessionId`;
  the event subset exists in the run output.
- **Performance**: one append per emitted event with batched flush (same pattern
  as `file-event-store`).
- **Breaking**: **yes** — see §4.2.

### P1.4 — Replay benchmark + model evaluation report

- **Source**: Kun `replay-benchmark.ts`; maka scorer taxonomy.
- **Design**: new `packages/evals/src/replay/`:
  - `ReplaySuite` (zod expect schema): `requiredTools`, `forbiddenBehaviors`,
    `expectedChangedFiles` (Jaccard), `maxErrorEvents`, `maxTotalMs`,
    `maxCostUsd`;
  - trajectory recorder: project existing `RuntimeEvent`s into replay inputs
    (no LLM call during replay — fast);
  - CLI `hachimi eval --suite <name> [--model deepseek-v4-pro,deepseek-v4-flash]`
    → markdown report + `failOnRegression` vs stored baseline.
- **Adaptation fit**: high — evals package exists; events already carry
  tool/usage data.
- **Performance**: replay is deterministic and cheap; model A/B costs are
  bounded by suite size and run on demand.
- **Breaking**: none (new package directory).

### P1.5 — Builtin-priority tool registration

- **Source**: Claude Code `assembleToolPool` (uniqBy, builtins win over MCP).
- **Design**: `ToolRegistry` keeps a per-name priority layer
  (builtin > extension > MCP). `register()` records the layer; `list()`/`get()`
  resolve by priority; `unregister()` at a lower layer cannot shadow a higher
  layer. MCP sync cannot silently override `run_command`, `read_file`, etc.
- **Adaptation fit**: high — registry is the single funnel.
- **Performance**: O(1) map + layer tag.
- **Breaking**: **minor** — see §4.3.

### P1.6 — Large tool-result archival + hydration

- **Source**: maka `tool-result-archive-artifacts`; Claude Code externalized
  results; W5 already caps tool results at 8 KB.
- **Design**: above the 8 KB cap, write the full result to
  `data/artifacts/{sessionId}/{toolCallId}.txt` and keep in
  `ToolResultEvent.result` a short summary + `artifactRef?`. `ContextBuilder`
  renders the event as `[结果过大已归档，可用 read_artifact 读取]`; new default
  builtin `read_artifact` (kind `read`, `readOnly`) hydrates on demand.
- **Adaptation fit**: high — W5 already truncates; this replaces silent loss
  with addressable loss.
- **Performance**: one write per oversized result (bounded, dedup by ref);
  prompt saves ~KBs per occurrence; fewer compaction triggers.
- **Breaking**: **yes** — see §4.4.

### P1.7 — Unified task registry (`TaskStateBase` family)

- **Source**: Claude Code `Task.ts` + `utils/task/framework.js`; craft-agents-oss
  TaskRunner run-logs.
- **Design**: `packages/core/src/tasks/task-registry.ts`:
  `TaskStateBase` (id / kind / status / outputFile? / createdAt / updatedAt /
  notified? / error?) + `registerTask/updateTaskState/getTask/listTasks`.
  Migrate `SubAgentTaskState` (sub-agent.ts) and background-task state
  (`background-task-manager.ts`) onto it; UI/activity projection and recovery
  share one path. Prefix IDs per kind (`task_sub_`, `bg_`).
- **Adaptation fit**: high — both state shapes are already near-identical.
- **Performance**: O(1) map.
- **Breaking**: **yes** — see §4.5.

---

## 3. Phase P2 — Differentiation

### P2.1 — Goal state machine + skeptic verification
- **Source**: grok `goal_tracker.rs` + skeptic panel.
- **Design**: add `goal` run mode on top of the existing loop: pure state machine
  (planning → acting → verifying, with `BackOffPaused` / `NoProgressPaused` /
  `InfraPaused`), stall detection (2 identical gap fingerprints), run cap (10).
  Completion is verified by N parallel read-only `reviewer` sub-agents
  (reuse P2 role surface) voting on the diff (majority-refute).
- **Fit / perf**: high / N extra read-only sub-agent runs only at completion.
- **Status**: ✅ implemented — pure `GoalMachine`
  (`packages/core/src/goal/goal-machine.ts`: planning → acting → verifying,
  no-progress stall on 2 identical gap fingerprints, run cap enforced by the
  runner + verdict gate, backoff/infra/no-progress pauses with resume) +
  `GoalRunner` (`packages/core/src/goal/goal-runner.ts`: plan sub-agent →
  acting agent run in a dedicated goal session → N parallel adversarial
  `reviewer` sub-agents, majority-refute feeds objections back into the next
  acting round; injectable deps for testing). Tools `start_goal` (async) /
  `goal_status` / `goal_list`; tasks registered in the unified `TaskRegistry`
  as `taskKind: "goal"`.

### P2.2 — DAG task orchestration
- **Source**: craft-agents-oss `TaskRunner`.
- **Design**: `task.yaml`-style spec (nodes, `depends_on`, `max_parallel`,
  inputs) → each node is a sub-agent session; interpolate `${nodes.<id>.output}`;
  append run-log; reuse `runParallelSubAgents` as the scheduler core.
- **Fit / perf**: high / DAG scheduling is O(nodes+edges).
- **Status**: ✅ implemented — `packages/core/src/tasks/dag-spec.ts` (JSON +
  minimal YAML subset parser with `max_parallel` / `depends_on` snake_case
  support, duplicate-id / unknown-dep / cycle validation) + `DagRunner`
  (`packages/core/src/tasks/dag-runner.ts`: topological scheduling with
  `max_parallel` batches, `${nodes.<id>.output}` interpolation, failed-dep →
  downstream `skipped`, run-log in the unified `TaskRegistry` as
  `taskKind: "dag"`). Tools `run_dag` (async) / `dag_status`; exposed via
  `HarnessRuntime.dag`.

### P2.3 — Deferred tool injection
- **Source**: pi `splitDeferredTools`.
- **Design**: only tools that appeared in the transcript (or are ungrouped/
  activated) enter the provider tool list each turn; `addedToolNames` on tool
  results can expand the set same-turn.
- **Fit / perf**: high / strictly fewer tokens per request.

### P2.4 — Skill context budget + `allowedTools`
- **Source**: grok `SKILL_BUDGET_CONTEXT_PERCENT`; Kun skill manifest.
- **Design**: skill manifest gains `allowedTools` + activation priority;
  ContextBuilder caps skill bytes at a percentage of the context window
  (overflow → description only, activate on demand).
- **Fit / perf**: high / protects context from skill bloat.

### P2.5 — memdir memory + autoDream gating
- **Source**: grok / Claude Code memdir.
- **Design**: long-term layer backed by a human-readable index file
  (`MEMORY.md`, ~200 lines/25 KB) + one file per memory + `sideQuery` returning
  ≤5 entries; consolidation gated cheapest-first (config → time → session
  count) with a lock file.
- **Fit / perf**: medium-high / embedding search stays, index makes content
  portable and debuggable.

### P2.6 — Rewind / checkpoint (event-first)
- **Source**: Claude Code `fileHistory.ts`; grok three-domain rewind.
- **Design**: `checkpoint` event (P0.4) + `file_history_snapshot` event
  (tracked-file backups keyed by messageId, cap 100); `/rewind` rebuilds the
  snapshot chain from the event stream. Optional git HEAD/index domain later.
- **Fit / perf**: high / snapshots are events (append-only philosophy intact).
- **Status**: ✅ implemented — `FileHistoryStore` (`packages/core/src/rewind/
  file-history.ts`) writes content to `{dataDir}/rewind/{sessionId}/{eventId}.md`
  (cap 100, oldest evicted, events retained), appends `file_history_snapshot`
  events (sha dedup per file/mode), and `rebuildSnapshotChain()` reconstructs
  per-file ordered chains purely from the event stream. Write tools
  (`write_file` / `replace_file_content` / `delete_file`) auto-capture before
  snapshots; tools `file_history_snapshot` / `file_history_list` /
  `restore_file_snapshot` (restore is `needs_confirm`) expose manual
  checkpoint, chain inspection and rollback. Runtime: `HarnessRuntime.
  fileHistory` + `listFileHistory()`. Git HEAD/index domain left for later.

### P2.7 — ACP client (external harness as provider)
- **Source**: t3code `effect-acp`.
- **Design**: `AcpClientProvider` (`packages/core/src/agent/providers/acp.ts`)
  drives a Codex/Claude/Grok process over stdio JSON-RPC (Agent Client
  Protocol v2) as a provider; it normalizes `session/update` notifications
  (agent_message / agent_thought / tool_call_update / usage_update) into
  `LLMResponse` and surfaces external tool activity through
  `onServerToolStart/onServerToolEnd` so the harness tool timeline stays
  intact. Not a second brain: it stays a provider behind
  `HarnessRuntime.execute()` — policy / PathJail / event flow are untouched.
- **Fit / perf**: medium / per-message JSON-RPC overhead, negligible.
- **Status**: ✅ implemented — new `acp` connection type (`command` +
  `commandArgs` + `cwd`, no API key required, `separateSession` /
  `autoApprovePermissions` options), catalog entry, `connection-tester`
  spawn+initialize probe, `resolveLlmSelection` readiness, and provider tests
  (spawned fake ACP agent: turn aggregation, streaming, session reuse, abort →
  `session/cancel`, probe). Permission requests default to reject with a
  clear log; configure the external agent to run without prompts
  (e.g. Codex `--full-auto`).

### P2.8 — Power/activity-aware background policy
- **Source**: t3code `background/BackgroundPolicy.ts`.
- **Design**: background/trigger execution consults an activity lease
  (TTL 45–120 s) + host power state; skip proactive triggers on battery/locked.
- **Fit / perf**: high / O(1) check per trigger tick.

---

## 4. Breaking-change register

Breaking changes are kept to five, each with a reason, blast radius, and
migration path.

### 4.1 P0.4 — Event schema gains optional fields + new event type
- **Reason**: cross-session/causal traceability (audit, sub-agent parenting,
  UI grouping) requires shared correlation keys; without them every consumer
  re-implements heuristic grouping. New `checkpoint` type is the seam for
  rewind (P2.6) — adding it now avoids a second schema bump later.
- **Blast radius**: `RuntimeEvent` union consumers; exhaustive `switch`
  statements fail at compile time (intended, benign). Storage readers must
  tolerate absent optional fields (all writers unchanged produce valid old
  shape).
- **Migration**: fields optional → old events parse as-is; new event type adds
  a branch to projections (default: ignore until P2.6).

### 4.2 P1.3 — Sub-agent sidechain persistence
- **Reason**: sub-agent task state is currently memory-only (sub-agent.ts Map).
  A process restart silently loses every async sub-agent's result — the exact
  gap Kun's orphan recovery and Claude Code's sidechain solve. Without this,
  "background delegation" is not durable and UI cannot render post-restart
  results.
- **Blast radius**: new `data/subagents/` directory; `SubAgentTaskState` gains
  persistence fields; recovery boot path scans the dir; `agent_output` reads
  disk fallback.
- **Migration**: on first boot, create the dir and mark any pre-existing
  in-memory tasks as already-finished (none survive restart anyway). Portable
  bundle v1 → v2 includes `subagents/` (import merges by `subSessionId`,
  dedup by event id).

### 4.3 P1.5 — Builtin-priority registration
- **Reason**: today `register()` is `tools.set(name, tool)` — a malicious or
  misordered MCP server can shadow `run_command`/`read_file`, silently changing
  what the model can do. Priority layers make the builtin surface
  non-overridable (trust pillar), matching Claude Code's `assembleToolPool`.
- **Blast radius**: registration semantics change; any test/plugin that
  overrode a builtin name must use the extension layer (same name allowed, but
  builtin wins in `list()`/`get()`).
- **Migration**: registry API unchanged (`register(tool, layer?)`); existing
  callers default to `extension`; builtins registered via the builtin
  registration path.

### 4.4 P1.6 — Large tool-result archival
- **Reason**: today W5 truncates oversized results to 8 KB — the model loses the
  tail irrecoverably, and the full payload never persists. Archival replaces
  silent loss with addressable loss (artifact ref + on-demand hydration), which
  is both a token-economy and a debugging win (maka/Claude Code both externalize).
- **Blast radius**: `ToolResultEvent` gains optional `artifactRef`; the
  semantics of `result` change from "full content" to "summary + ref" for
  oversized results; agent tool-result backfill path changes; new `read_artifact`
  tool registered by default.
- **Migration**: old events without `artifactRef` render as before (full
  content); new oversized results are archived; UI shows an "archived" chip with
  a hydration action; `read_artifact` is `readOnly` + `safe` so no permission
  churn.

### 4.5 P1.7 — Unified task registry
- **Reason**: sub-agent and background-task state machines are two parallel
  implementations of the same shape; UI, persistence, and recovery each need a
  switch. One `TaskStateBase` family gives a single lifecycle, single projection,
  single recovery path (Claude Code's task framework; craft-agents-oss run-logs).
- **Blast radius**: internal types `SubAgentTaskState` / background-task state
  migrate to the base; call sites in sub-agent.ts, background-task-manager.ts,
  and their tests/UI references update. Public `@hachimi/core` exports remain
  stable (registry is additive).
- **Migration**: type alias `SubAgentTaskState = TaskStateBase & {…}` during a
  transition window; move fields incrementally; tests updated in the same PR.

---

## 5. Sequencing & verification

| Batch | Items | Gate |
|-------|-------|------|
| P0 | P0.1–P0.4 | `pnpm typecheck` + `pnpm lint` + `pnpm test` (480 baseline) + `pnpm smoke:mock` |
| P1 | P1.1–P1.7 | same + evals suite + replay smoke; portability round-trip test for P1.3/P1.6 |
| P2 | P2.1–P2.8 | same + perf sanity (context build time, tool-list time) |

Each PR ships tests for the new behavior (policy/pipeline touches get
`tests/core/permission-matrix`-style coverage) and updates `COMPARISON.md`
status column.

## 6. Rollback strategy

- All P0/P1 changes are additive or guarded by feature flags:
  - P0.4/P1.5/P1.6: reading old data is supported; disabling the flag restores
    old semantics except archived artifacts (kept on disk, harmless).
  - P1.3: sidechain dir is inert if empty; recovery scans it only when present.
- A breaking batch is never merged with another breaking batch (one migration
  at a time).
