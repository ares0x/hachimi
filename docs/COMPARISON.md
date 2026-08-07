# Harness Comparison — What to Borrow From Six Open-Source Projects

Revision 1. Purpose: harvest **designs and features** (never code) from the
reference projects under `~/workspace/Code/Node/OpenSource` and turn them into a
prioritized backlog for making Hachimi mature, usable, and complete. Each item
is mapped to Hachimi's existing architecture so proposals extend `Work` /
`RuntimeEvent` / policy instead of bypassing `HarnessRuntime.execute()`.

Sources examined (Aug 2026):

- `claude-code-analysis` — static analysis docs of Anthropic Claude Code's leaked source
- `grok-build` — SpaceXAI's Rust terminal agent (TUI + headless + ACP)
- `maka-agent` — local-first Electron desktop AI workbench (closest product sibling)
- `pi` (`earendil-works/pi`) — minimal TypeScript agent harness
- `t3code` — "agent harness control surface" for Claude/Codex/Cursor/Grok/OpenCode
- `Kun` — requirement-first coding GUI with low-cost model routing

## 1. Per-project harness profile

### claude-code-analysis (Claude Code)

Confirmed designs (from the analysis docs, all also publicly documented by Anthropic):

- Append-only JSONL transcript with **metadata entries in the same stream**
  (title / tag / agent / mode / worktree / PR); resume is a pipeline:
  load → metadata recovery → link repair → UI re-takeover.
- **Subagent sidechain transcripts** — each subagent gets its own `.jsonl` for
  fork / teammate / subagent recovery.
- Compact / snip / parallel tool-result **link repair** on resume.
- **Effective context window** = model window − reserved summary budget;
  auto-compact triggers; prompt-too-long self-fuse / degrade.
- Four-layer bash sandbox chain: `shouldUseSandbox()` decision → settings
  translated to runtime config → `bashPermissions` merges sandbox auto-allow with
  deny/ask rules → host-level cleanup after command.

Hachimi already covers: append-only JSONL events (W0), session recovery (J1),
rule compaction + 8 KB tool-result cap (W5), PathJail/ToolSandbox/shell-ast-guard
execution chain (H2.4), permission matrix + rules (W2/J4).

### grok-build (Rust)

- **Headless mode is an ACP lifecycle** (`init → auth → session → prompt`),
  streaming to stdout with cancellation — one protocol for TUI, headless, editor.
- `memory clear --workspace/--global --yes` — scoped memory wipe with confirm.
- `obf.rs` — compile-time obfuscated secret strings for binary hardening.
- PTY wrap + scrollback + input log (interactive command capture).
- `trace` / `memory trace` diagnostics commands; desktop notifications; project
  picker; git-info; share/export commands.

Hachimi already covers: ACP stdio server (J6), background tasks (J3), CLI session
subcommands (J1), `clear:sessions` / `clear:memories` scripts.

### maka-agent (desktop workbench)

The richest source of borrowable harness concepts:

- `classifyAgentRunRecovery` — interrupted runs are **classified by last event**
  (`app_restarted`, `stale_permission_wait`, `tool_interrupted`, `event_corrupt`)
  with diagnostics and **lineage** (`parentRunId`, `retriedFromTurnId`,
  `regeneratedFromTurnId`, `branchOfTurnId`).
- `RunTrace` — diagnostic event phases (turn / model / tool / permission / abort /
  usage) kept separate from the conversation record.
- Tool availability **economy + `load_tools` group gating**: only ungrouped tools
  advertised each turn; groups activate same-turn and **re-seed from the event
  ledger** across turns.
- PermissionEngine: parked-Promise approval registry + **per-turn remember scoped
  to a tool intent**.
- **Typed compaction boundaries** (`historyCompact`, `staleToolResultPrune`,
  `activeToolResultPrune`, `activeFullCompact`, `semanticCompact`) with archive
  refs (`bodySha256`, artifactId) so compressed content stays reconstructible.
- **Incognito workspace privacy context** — privacy flag authoritative in the
  main process only; renderer can never self-attest.
- Daily review summary — on-demand aggregation of sessions / tokens / cost / top
  tools / top models from existing telemetry.
- Stream watchdog — connect timeout (30 s) / idle timeout (120 s); **permission
  waits are paused, not counted as model silence**.
- File-write lock; credentials file-first with `0700/0600`; OAuth tokens in
  Electron `safeStorage` with fail-closed.

Hachimi already covers: event store + recovery (J1/J0), grant store (J4), rule
compaction (W5), `CredentialStore` with `0600` + atomic writes, approval flow (W2).

### pi (earendil-works)

- Explicitly **no built-in permission system** — "containerize or sandbox Pi"
  (three documented patterns). Hachimi deliberately diverges: policy-first is a
  differentiator.
- SQLite session storage with **branch entries, session sequences, materialized
  sessions**.
- Compaction with **branch summarization** — summarize a branch before merging
  it back into the main thread.
- `pi-ai` unified multi-provider transport; prompt templates and skills as
  first-class harness concepts; mid-turn steering; self-extensible agent.

Hachimi already covers: provider abstraction (Phase C), steering/followUp (C6),
skills (E2), Work/plan (W1).

### t3code (control surface)

- **ACP client** (`effect-acp`) — controls Claude Code / Codex / Cursor / Grok /
  OpenCode from one UI over their native protocols.
- `orchestration` protocol: `dispatchCommand`, **`getTurnDiff` /
  `getFullThreadDiff`** (diff-based UI sync), `searchThreads`, approvals.
- `background` contract: **host power / thermal state** (idle, locked, suspended,
  battery) used to manage background work.
- Remote access built-in (SSH, Tailscale); permission modes; source-control
  integrations; mobile + web + desktop surfaces over a local server.

Hachimi already covers: ACP server (J6), API/Web/Desktop/TUI channels.

### Kun (requirement-first GUI)

- **Auto model routing**: cheap `flash` model for trivial turns vs `pro` for
  coding/debugging/tool-heavy work, decided by a fast classifier with heuristic
  fallback + timeout; also routes **reasoning effort** (off/high/max).
- `<untrusted-content>` wrapping — external/web content is explicitly tagged so
  prompts are injection-aware.
- Plan → Todo → coding → **change review** workflow; requirement change triggers a
  **re-plan suggestion**.
- Secret store; history healing; context estimator; compaction markers;
  immutable-prefix prompt cache; cost-aware defaults.

Hachimi already covers: Plan Mode (J2), Work/plan model (W1), approval + diff
permission UI (W3), prompt-cache-stable ContextBuilder (B2).

## 2. Borrowable backlog (prioritized)

| # | Feature | Source | Why it matters for Hachimi | Effort | Status |
|---|---------|--------|---------------------------|--------|--------|
| B1 | **Run recovery classification + lineage** (failure class per interrupted run; `parentRunId` / `retriedFromTurnId` / `branchOfTurnId` on Work/events; UI shows "why interrupted" + resume/retry/branch) | maka, pi | Turns J1 recovery from "rebuild messages" into "explain & act"; fits Work/event model | M | Classification done (K1); turn-lineage fields still open |
| B2 | **Untrusted-content tagging** (`<untrusted-content>` wrapper for web/MCP/imported content) | Kun | Hardens the loop against prompt injection from tool results; deterministic, cheap | S | Done (K2) |
| B3 | **Tool gating economy (`load_tools`)** — advertise only ungrouped tools; activate groups on demand; re-seed from events | maka | Context governance as the tool catalog grows; same-turn activation | M | Done (K7); activation in-process only, event re-seed future work |
| B4 | **Typed compaction with archived tool results** (boundaries + `bodySha256` archive refs; compressed content reconstructible; events never rewritten) | maka, pi, Claude Code | Upgrades W5 rule compaction into a first-class, auditable context pipeline | M |
| B5 | **Stream watchdog** (connect/idle timeouts; permission waits paused) | maka | Reliability for flaky model streams; complements 30 s tool timeout | S | Done (K3) |
| B6 | **Auto model routing (flash/pro + reasoning effort)** with heuristic fallback | Kun | Cost control while staying model-agnostic; fits "provider is a swap" positioning | M | Done (K6): heuristic classifier + per-turn tier routing via `agent.autoModelRouting` |
| B7 | **Incognito privacy context** (main-process authoritative, per-work opt-out of memory/logs) | maka | Trust pillar; portable/deletable data story | M |
| B8 | **Daily usage summary** (on-demand tokens/cost/tools from event data) | maka | Observability; users can see where budget goes | S | Done (K5): transport usage capture + `hachimi usage [--days N|--all]` |
| B9 | **Memory clear CLI** (`hachimi memory clear --memories/--sessions/--all --yes`) | grok | Mature CLI surface; completes J1 session subcommands | S | Done (K4) |
| B10 | **Notifications on long background tasks** | grok | Desktop polish; complements J3 background tasks | S | Planned in Phase L (Desktop P0, L1) |
| B11 | **Host power/thermal awareness for background tasks** (pause on battery/locked) | t3code | Keeps background work predictable on laptops | S | Planned in Phase L (Desktop P2, L3) |
| B12 | **Turn/thread diff + search protocol** (`getTurnDiff`, `searchThreads`) | t3code | Efficient UI sync and cross-session search over Activity projection | M | Lite search in Phase L (L1); full diff sync in L3 |
| B13 | **ACP client / control-surface option** (drive external harnesses from Hachimi) | t3code | Optional channel, not core; single-brain principle unaffected | L | Optional in Phase L (L3) |
| B14 | **Session branching storage** (SQLite branch entries + sequences + branch summaries) | pi, maka | Long-running Works that fork; branch-of-turn lineage | L |

## 3. Explicit non-borrows

- pi's "no permission system, containerize instead" — rejected by design:
  policy-first is a Hachimi differentiator (trust pillar).
- t3code's core (multi-harness control surface) — not Hachimi's center; could
  exist later as an optional ACP-client channel.
- Claude Code leaked-source implementation details — design patterns only;
  anything non-public is out of scope by licensing/ethics.

## 4. Suggested next phase

The harness slice **B1+B2+B5+B9** then **B3/B6/B8** is delivered (Phase K).
Desktop productization (Phase L, see `ROADMAP.md`) then shipped: daemon
lifecycle, tray/notifications/global shortcut, background-task and usage/cost
panels, cross-session search, approval diff + GrantStore remember, memory UI,
incognito per-Work, audit log, permission-rules editor, offline recovery.
Remaining tracks (**L2** onboarding / recent projects, **B4** typed compaction,
**W6** connector surfacing, **F6** trigger wiring) stay on the roadmap. All
items keep execution truth in `RuntimeEvent` and route through
`HarnessRuntime.execute()`.
