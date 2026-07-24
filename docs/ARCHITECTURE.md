# Hachimi Architecture

> Revision 4. Reconciles a phase-lettering drift: an earlier edit of this file
> temporarily split phases into an A–J scheme that was never carried over into
> `ROADMAP.md`/`TASK.md`, which kept tracking the original A–G scheme (and
> `TASK.md` had already marked real sub-items done under it). Since
> `ROADMAP.md`/`TASK.md` are the operationally active documents, this file is
> reverted to match their A–G lettering — no prose content is lost, only
> phase letters. One substantive addition survives from the A–J attempt: a
> minimum tool-execution sandbox is now called out as a Phase C item (see
> `ROADMAP.md`), not deferred to the final hardening phase — see the
> "why now" note under Design Principle 6. Known Technical Debt below is
> also refreshed: Phase A and B are done, so their old debt items are
> resolved; newly found structural issues (verified against the current
> codebase) are tracked in `docs/REFACTOR_PLAN.md` instead of duplicated here.

## Reference sources

The design decisions below are informed by three legitimately public, permissively
licensed projects — read for structure and philosophy, never for copied
implementation:

- **`earendil-works/pi`** (MIT) — minimal harness philosophy, package separation,
  multiple run modes, mid-turn steering.
- **`xai-org/grok-build`** (Apache-2.0, official xAI release) — crate-level
  separation of TUI / runtime / tools / workspace, and a mature harness's feature
  checklist (MCP, skills, plugins, hooks, headless, sandboxing).
- **`NousResearch/hermes-agent`** (open source) — channel-agnostic core running
  across CLI/messaging/TUI/desktop, provider-transport abstraction, prompt-cache
  discipline, self-improving skill loop.

We deliberately do **not** use `liuup/claude-code-analysis` as an architectural
input. That project is a static analysis built on a decompiled reconstruction of
Claude Code's proprietary source — its provenance makes it unsuitable as a design
reference regardless of how the analysis is framed. Where we want Claude Code's
publicly-documented ideas (e.g. hierarchical memory, lazy skill loading), we cite
Anthropic's own public material (*Building effective agents*, the Claude Agent SDK
docs) instead.

## Product Vision — Four Pillars

| # | Pillar | What it constrains architecturally |
|---|--------|--------------------------------------|
| P1 | **Local-first, migratable memory** | Data lives on the user's machine by default and must be movable to a new machine without data loss. "Storage" and "portability format" are two different concerns, not one. |
| P2 | **Gets better at knowing the user over time** | Memory isn't just storage — it needs a standing consolidation/retrieval loop, not a feature bolted on late. |
| P3 | **Deep extensibility** — providers, tools, skills, MCP | These extension axes share one underlying registration/discovery pattern, designed once. |
| P4 | **Multi-surface**: Desktop, API, and API-fed clients (Telegram, web) | Only one process can be the source of truth for a user's session/memory state at a time. |

## Runtime Topology: Embedded Mode vs. Daemon Mode

The most consequential architectural commitment so far, driven directly by P4.

Instantiating `@hachimi/core` independently per channel is fine when only one
channel is ever active, but breaks the moment two surfaces need to be live at
once — a Telegram bridge listening in the background while Desktop is also
open, both referring to the same memory and the same in-flight session. Two
independent core instances would diverge immediately.

So Hachimi supports **two ways of running the same `@hachimi/core`**:

- **Embedded mode** — a process instantiates `@hachimi/core` directly,
  in-process. This is what `apps/tui` does today. Correct for one-off CLI
  invocations, tests, scripting, a single-user TUI session.
- **Daemon mode** — exactly one long-running process (`apps/server`) holds
  the canonical `@hachimi/core` instance plus memory/session state. Desktop,
  a web UI, the Telegram bridge, even the TUI, connect to this one process as
  thin clients over a local API. One brain, many windows into it.

`apps/server` is therefore the thing that makes Desktop + Telegram + web
coexist correctly, not "the second, non-essential channel" — it's built in
Phase C, before Desktop (Phase F).

Security note: a daemon accepting local (and potentially remote, for a
Telegram bridge on a VPS talking home) connections is a larger attack surface
than an in-process embed. The permission engine (`safe`/`needs_confirm`/
`dangerous`) protects tool execution, but daemon mode also needs
transport-level auth and a minimum tool-execution sandbox — both scheduled as
Phase C items (see `ROADMAP.md`), landing before Phase F wires up a Telegram
bridge, not after.

```
                     ┌─────────────────────────────────────────┐
                     │              Daemon Mode                 │
  Desktop UI ───┐    │   ┌───────────────────────────────────┐  │
  Web UI ───────┼────┼──►│     apps/server (local API)         │  │
  Telegram ──────┘    │   │  auth: local token · tool sandbox    │  │
                     │   └──────────────┬──────────────────────┘  │
                     │                  ▼                          │
                     │        ┌──────────────────┐  ← single      │
                     │        │  @hachimi/core    │    source of   │
                     │        └──────────────────┘    truth         │
                     └─────────────────────────────────────────┘

                     ┌─────────────────────────────────────────┐
                     │             Embedded Mode                 │
                     │   apps/tui (interactive) ──┐               │
                     │   print/JSON mode ──────────┼──► @hachimi/core │
                     │   scripts / tests ──────────┘   (in-process)  │
                     └─────────────────────────────────────────┘
```

Both modes construct `@hachimi/core` through the same public entry point —
the only difference is what sits in front of it.

## Portable Memory: Export/Import Bundle (P1)

A raw SQLite file copied between machines is fragile across schema versions
and platform-specific extensions. Two separate concerns:

1. **Runtime store** — whatever is fastest to query while running (file-backed
   JSON, now SQLite + vector search since Phase B). Implementation detail.
2. **Portable bundle** — a versioned, engine-independent export format, the
   actual unit of migration and backup (Phase D). This is what a user moves
   to a new machine, not the raw database file.

Bundle requirements: explicit schema version field with an upgrade path (not
just rejection of old bundles); contains all four memory layers, session
history, and skill-usage state; export/import as first-class commands; import
is additive-with-conflict-resolution by default, not silent overwrite.

## Unified Extension Registry (P3)

Tools, skills, and MCP look like three separate systems but share one shape:
"register a named capability with a short description for the model, resolve
to full content/execution on demand, gate by permission." Phase E converges
`ToolRegistry` and `SkillRegistry` onto one interface and treats an MCP client
as another instance of it, rather than a fourth bespoke system:

```ts
interface CapabilitySource<T> {
  list(): CapabilityDescriptor[];       // short form, goes in system prompt
  resolve(name: string): Promise<T>;    // full form, loaded on demand
  permission(name: string): ToolPermission;
}
```

Provider selection (`ProviderTransport`, Phase C) deliberately does **not**
fit this shape: only one provider is active per session, so it's a
strategy/swap point, not a many-registered-capabilities list.

## Personalization: Two Tiers, Not One (P2)

- **Tier 1 — Consolidation (foundational, Phase B — done).** Deduplication,
  importance decay, session summarization, embedding-based retrieval. The
  mechanism, not the feature.
- **Tier 2 — Self-directed skill/behavior evolution (advanced, Phase F).**
  The agent proposing new skills from repeated patterns, proactive triggers,
  sub-agent delegation. Depends on Phase E's hooks and a mature Tier 1 to
  learn from.

## High-level Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│         Clients: TUI (embedded) · Desktop · Web · Telegram bridge      │
│         (Desktop/Web/Telegram are daemon clients — see Runtime Topology)│
└──────────────────────────────┬──────────────────────────────────────┘
                                │  IncomingMessage / OutgoingMessage
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                            Core Harness  (@hachimi/core)                │
│  Agent Loop ◄─ Context Builder (prompt-cache stable, done) ◄─ Capability│
│      │                                                     Registries   │
│      ▼                                                (converging)     │
│  Tools · Permissions (unified type, done) · Hooks (planned)             │
│      │                                                                  │
│      ▼                                                                  │
│  Hierarchical Memory + Consolidation Loop (Tier 1, done)                │
│  Working → Session → Long-term → Archival · embedding retrieval         │
│      │                                                                  │
│      ▼                                                                  │
│  Session Manager        LLM ProviderTransport (multi-vendor, done)      │
└──────────────────────────────┬──────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│      Runtime Store (SQLite + vector, impl detail, can change)           │
│      Portable Bundle (versioned export/import — the migration unit)    │
└───────────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Core is Channel-Agnostic
`@hachimi/core` has zero knowledge of TUI, HTTP, or messaging platforms. All
channels convert native input into `IncomingMessage`/`OutgoingMessage`. One
current gap: `ChannelType` is a closed union that already lists channels not
yet built (`wechat`, `slack`) — see `docs/REFACTOR_PLAN.md` item 6 for the fix.

### 2. Hierarchical Memory (Tier 1 personalization mechanism) — Done
Working → Session → Long-term → Archival, file-persisted, with
embedding-based similarity search (cosine similarity against stored
embeddings) as of Phase B.

### 3. Lazy Skills, Converging Toward a Shared Registry Shape
System prompt carries only a one-line description per skill; full
instructions + tools load on activation. Skill activation is model-chosen (an
`activate_skill` tool the model calls explicitly) rather than text-pattern
matching, as of Phase B4. Phase E converges this with `ToolRegistry` and MCP
onto one `CapabilitySource` shape, and adds installable skill packages.

### 4. Provider Transport Abstraction — Done, naming needs a pass
`ProviderTransport` is a real interface with concrete transports
(`OpenAICompatibleProvider`, `AnthropicProviderTransport`) behind
`ProviderRegistry`. One naming issue: `ProviderType` currently mixes
protocol-level (`openai-compatible`), vendor-level (`deepseek`, `qwen`), and
model-family (`claude`) names in one flat union — see
`docs/REFACTOR_PLAN.md` item 4.

### 5. Prompt-Cache Stability — Done
`ContextBuilder.build()` explicitly separates a static cache-stable prefix
(identity → skill descriptions → tool descriptions) from a dynamic region
(active skill detail → retrieved memories → history), with a comment in the
source noting this ordering must not shift. This matters more, not less, once
a daemon serves multiple concurrent sessions — cache misses multiply across
every connected client.

### 6. Minimal Core, Optional Permission Layer, Now Also Transport Auth + Sandbox
Hachimi keeps its permission skeleton because P2's proactive behavior needs an
in-process approval gate. Daemon mode (P4) adds two further, independent
requirements: transport-level authentication and a tool-execution sandbox —
both scheduled inside Phase C, alongside daemon mode itself, specifically
because shipping a Telegram bridge (Phase F, a remote and less-trusted
client) before either exists would be a real ordering risk. These are three
different layers and should not be conflated into one permission system.

### 7. Headless First, Multiple Entry Modes
Phase C's embedded print/JSON mode and daemon mode together cover this:
embedded-print for scripts/cron, daemon+API for everything else.

### 8. Extension Points Without Modifying Core
Hooks (Phase E) are the mechanism Tier 2 personalization (Phase F) depends
on — a hard prerequisite, not just a nice-to-have.

## Known Technical Debt

Phase A and B are done — the debt items that used to live here (duplicate
permission types, non-cache-stable context builder, keyword-only memory
search) are resolved. Newly identified structural issues, verified against
the current codebase, are tracked with file-level fix instructions in
**`docs/REFACTOR_PLAN.md`**: deep relative imports bypassing `@hachimi/core`'s
public API, an incomplete `index.ts` export surface (the root cause of the
previous item), the `ChannelType` closed-union coupling, provider-naming
conflation, config's legacy-field sunset path, and a few smaller items
(`skills/examples/` naming, `scripts/` cleanup, `AppContext` responsibility
creep). Read that file before starting Phase C4 (`apps/server`) — the plan is
explicitly sequenced to land before the daemon becomes a second consumer of
`@hachimi/core`'s exports.

## Key Interfaces

See `packages/core/src/types/index.ts` for current definitions.

- `IncomingMessage` / `OutgoingMessage` — channel protocol boundary
- `ToolDefinition` — tool registration + permission classification (unified
  `ToolPermission` type, Phase B1)
- `SkillDefinition` / `SkillContent` — lazy skill contract
- `MemoryAccess` / `MemoryEntry` — how the agent reads/writes memory
- `ProviderTransport` / `ProviderTransportConfig` — multi-vendor model access
- `CapabilitySource<T>` — proposed, not yet in code; the target shape Tools/
  Skills/MCP converge on in Phase E

## Module Boundaries

- **Agent** (`core/src/agent`): reasoning + tool-calling loop, delegates to
  `ProviderTransport` for model access.
- **Context** (`core/src/context`): assembles the system prompt; the one
  place prompt-cache discipline is enforced.
- **Memory** (`core/src/memory`): four-layer state + Tier 1 consolidation.
- **Session** (`core/src/session`): multi-turn history, separate from
  long-term memory by design.
- **Skills / Tools** (`core/src/skills`, `core/src/tools`): converging on
  `CapabilitySource`.
- **Channels** (`packages/channels/*`, `apps/tui`, `apps/server`): pure
  adapters. `apps/server` additionally hosts the daemon-mode canonical core
  instance, transport auth, and the tool-execution sandbox boundary.

## Implementation Order

See `ROADMAP.md` for the full phase plan and `docs/TASK.md` for the active
task breakdown of the current phase.

1. Phase A — Foundation~~ (done)
2. Phase B — Foundation debt + SQLite/vector memory + token accounting~~ (done)
3. Phase C — Provider transport (done) + embedded/headless modes + daemon
   mode + minimum sandbox + transport auth *(in progress — see `TASK.md`)*
4. Phase D — Portable memory bundle
5. Phase E — Unified extension registry (tools/skills/MCP), hooks
6. Phase F — Multi-surface clients (Desktop, web, Telegram) + Tier 2
   personalization (self-directed skills, sub-agents, scheduling)
7. Phase G — Hardening (sandbox maturity, auth completeness, bundle security)
