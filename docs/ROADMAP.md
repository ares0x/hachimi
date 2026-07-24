# Development Roadmap

Revision 2. Reordered relative to Revision 1 based on the four product
pillars in `ARCHITECTURE.md` (local-first/portable memory, personalization,
extensibility, multi-surface). The biggest change: **daemon mode / local API
(old Phase E) moves up to Phase C**, and **portable memory export/import
becomes its own phase (D)** instead of being an implicit part of storage work.
Desktop moves from "last, biggest lift" to "a client built once the daemon
exists" inside Phase F.

Each phase must leave the project runnable and testable, and closes with a
short review before the next one starts.

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
**Goal**: Resolve the structural issues identified in `ARCHITECTURE.md` before
adding new surface area on top of them. This is also where Tier 1
personalization (the "gets better at knowing you" mechanism) becomes solid.

- [x] **B1 — Unify permission types.** Collapse `PermissionLevel` and
      `ToolPermission` into one type, used consistently.
- [x] **B2 — Prompt-cache-stable `ContextBuilder`.** Fixed prefix
      (identity/tools/skill-descriptions), variable content after a clear
      boundary. Replace "splice out a random middle block" truncation with
      tail-only trimming.
- [x] **B3 — Memory retrieval v2 (Tier 1 personalization).** Embedding-based
      similarity search in `MemoryManager.search()`, same four-layer model.
- [x] **B4 — Reconsider skill-activation detection.** Regex-based skill
      matching is brittle; evaluate exposing activation as a model-chosen tool
      call instead.
- [x] **B5 — Harden consolidation.** `deduplicate()`/`prune()`/
      `summarizeSession()` exist but are simple; this is the point to make
      them reliable, since Phase D's export/import bundle will carry whatever
      state this loop produces.

## Phase C — Provider Abstraction + Runtime Topology
**Goal**: A second provider doesn't touch `Agent`, and — the reordering that
matters most this revision — **one core instance can serve multiple
concurrent clients**, because Desktop + Telegram + web all need to be able to
share one running assistant (P4).

- [ ] **C1 — `ProviderTransport` interface.** `openai-compatible` as first
      concrete transport; message/tool-call conversion moves out of `Agent`.
- [ ] **C2 — Embedded-mode non-interactive entry.** Print/JSON single-turn
      mode for scripts, cron, tests.
- [ ] **C3 — SDK export from `@hachimi/core`.** `createAgentSession()`-style
      programmatic entry point, used by both embedded and daemon modes.
- [ ] **C4 — Daemon mode: `apps/server` becomes real.** A long-running
      process holding the one canonical `@hachimi/core` instance behind a
      local HTTP/WS API. This is the promoted item from Revision 1's Phase E
      — it now lands here because Phase F's multi-surface clients
      structurally depend on it existing first.
- [ ] **C5 — Minimum transport auth.** A local token (at minimum) gating the
      daemon's API before anything beyond localhost-TUI connects to it.
- [ ] **C6 — Mid-turn steering (stretch).** Pi's `steer()`/`followUp()`
      pattern, useful once a daemon may have a client mid-conversation while
      another client also wants to send input.

## Phase D — Portable Memory (P1)
**Goal**: Memory can move to a new machine without manual reconstruction —
promoted out of "storage implementation detail" into its own phase because
it's a direct product promise, not a side effect of picking a database.

- [ ] **D1 — Versioned bundle format.** All four memory layers + session
      history + skill-usage state, with an explicit schema version field.
- [ ] **D2 — Export command.** One command produces a bundle from the current
      runtime store (file or SQLite, whichever is active).
- [ ] **D3 — Import command with merge semantics.** Additive-with-conflict-
      resolution by default, not silent overwrite — a user may be
      consolidating two machines, not just moving.
- [ ] **D4 — Schema migration path.** Import must upgrade an older bundle
      version, not just reject it, since this is meant to outlive several
      future storage-engine changes.

## Phase E — Unified Extension Registry (P3)
**Goal**: Tools, skills, and MCP converge on one `CapabilitySource` shape
(see `ARCHITECTURE.md`) instead of arriving as separate bespoke systems.

- [ ] **E1 — Refactor `ToolRegistry`/`SkillRegistry`** onto a shared
      `CapabilitySource<T>` interface (list/resolve/permission).
- [ ] **E2 — Skills as installable packages.** npm/git-installable skill
      packages (Pi/Grok-Build pattern), discovered the same way in-repo
      skills are today.
- [ ] **E3 — Hooks.** Concrete pre-tool-call / post-tool-call / session-start
      extension points — the prerequisite Phase F's Tier 2 personalization
      needs.
- [ ] **E4 — MCP client**, implemented as another `CapabilitySource<ToolDefinition>`
      rather than a parallel tool-loading path.

## Phase F — Multi-Surface Clients + Tier 2 Personalization
**Goal**: This is where P4 (Desktop/API/Telegram/web) and P2's advanced tier
(self-directed skill evolution, proactive behavior) both land — grouped
together because both depend on everything above (daemon mode, hooks,
extensibility) already existing.

Multi-surface:
- [ ] **F1 — Desktop client.** A UI that talks to the Phase C daemon over its
      local API — not a separate embed of core. Electron or Tauri; the choice
      matters less now that Desktop is "just a client."
- [ ] **F2 — One messaging channel** (Telegram, given existing `ChannelType`
      support) as a daemon client — the real test of "core has zero channel
      knowledge," since this is the first client that isn't run by the same
      person sitting at the machine.
- [ ] **F3 — Web client** (optional at this stage, same daemon API as F1/F2).

Tier 2 personalization:
- [ ] **F4 — Minimal sub-agent delegation.** Narrow and explicit (one parent,
      a small number of typed sub-tasks) — matches "minimal Multi-Agent"
      product identity rather than an open-ended framework.
- [ ] **F5 — Skill-from-experience extraction.** An `afterTurn` hook (Phase
      E3 prerequisite) proposing new skills/refinements from session-history
      patterns.
- [ ] **F6 — Scheduled/proactive triggers.** Cron-style or event-driven
      prompts, gated by the existing permission engine plus Phase C5's
      transport auth.

## Phase G — Hardening
**Goal**: Close the gaps that only matter once multiple real clients and
proactive behavior are both live.

- [ ] **G1 — Sandboxing story for `dangerous`-permission tools**, independent
      of the in-process approval gate — Grok Build's public docs are a useful
      checklist of what "documented sandboxing" looks like.
- [ ] **G2 — Transport auth completeness.** Beyond Phase C5's minimum token:
      per-client scoping if a remote Telegram-bridge-on-a-VPS scenario is
      actually going to be supported (P4 mentions this as a stretch case).
- [ ] **G3 — Bundle-format security review.** The portable memory bundle (D1)
      is now also a backup artifact — confirm it doesn't leak anything
      sensitive if a user syncs it through a general-purpose cloud drive.

---

## Explicitly out of scope for this roadmap
- Anything derived from `liuup/claude-code-analysis`. If a future phase wants
  a Claude-Code-documented idea, cite Anthropic's own public docs instead.
- Full multi-agent orchestration frameworks (F4 stays intentionally narrow).
- Remote/multi-user daemon hosting (G2's VPS case is a stretch note, not a
  committed deliverable, unless the product vision explicitly expands to it).
