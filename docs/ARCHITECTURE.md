# Hachimi Architecture

> Revision 3. Phase lettering below now matches `ROADMAP.md` Revision 3, which
> split the old combined "daemon mode" phase into a provider/embedded-modes
> phase and a separate daemon+sandbox+auth phase, and split the old combined
> "multi-surface + personalization" phase into three — driven by the tutorial
> repo's chapter-sized pacing constraint. Revision 2's product-vision content
> (four pillars, daemon topology, portable memory, unified registry) is
> unchanged; only phase numbers moved. See `ROADMAP.md`'s header for why.

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

Everything below is organized around four commitments the product makes. Each
architectural decision in this document should trace back to one of these.

| # | Pillar | What it constrains architecturally |
|---|--------|--------------------------------------|
| P1 | **Local-first, migratable memory** | Data must live on the user's machine by default, and must be movable to a new machine without data loss or manual reconstruction. This means "storage" and "portability format" are two different concerns, not one. |
| P2 | **Gets better at knowing the user over time** | Memory isn't just storage — it needs a standing consolidation/retrieval loop that runs continuously, not a feature bolted on late. |
| P3 | **Deep extensibility** — providers, tools, skills, MCP | These four extension axes should share one underlying registration/discovery pattern, designed once, not four bespoke systems built in different phases. |
| P4 | **Multi-surface**: Desktop, API, and API-fed clients (Telegram, web) | Only one process can be the source of truth for a user's session/memory state at a time. If Desktop, a Telegram bridge, and a web client can all be active concurrently, they cannot each embed their own independent copy of `@hachimi/core` — they need to talk to the same running instance. |

The remaining sections work through the concrete design implications of P1–P4.

## Runtime Topology: Embedded Mode vs. Daemon Mode

The most consequential architectural change so far, driven directly by P4.

Instantiating `@hachimi/core` independently per channel is fine when only one
channel is ever active (e.g. the `tutorial` branch's TUI-only demo), but it
breaks the moment two surfaces need to be live at once — a Telegram bridge
listening in the background while the Desktop app is also open, both referring
to the same memory and the same in-flight session. Two independent core
instances would immediately diverge: memory written via Telegram wouldn't be
visible in the Desktop UI until both happened to reload from disk, and two
agent loops could both decide to act on the same proactive trigger.

So Hachimi needs **two supported ways of running the same `@hachimi/core`**,
not one:

- **Embedded mode** — a process instantiates `@hachimi/core` directly,
  in-process. No daemon, no network hop. This is what `apps/tui` does today,
  and what the non-interactive print/JSON mode (Phase C) will do. Correct for:
  one-off CLI invocations, tests, scripting, a single-user TUI session where
  nothing else needs to see the same state concurrently.
- **Daemon mode** — exactly one long-running process (`apps/server`) holds the
  canonical `@hachimi/core` instance plus memory/session state. Every other
  surface — Desktop, a web UI, the Telegram bridge, even the TUI if the user
  wants it — connects to this one process as a thin client over a local API
  (HTTP/WS on localhost by default). This is what makes P4 actually true: one
  brain, many windows into it.

`apps/server` is therefore the thing that makes Desktop + Telegram + web
coexist correctly, not "the second, non-essential channel." The local API
server (Phase D) is built **before** Desktop (Phase H) — Desktop becomes a
client of the daemon rather than another embedder of core.

Security note: a daemon that accepts local (and potentially remote, for a
Telegram bridge running on someone's own VPS talking home) connections is a
larger attack surface than an in-process embed. The existing permission engine
(`safe`/`needs_confirm`/`dangerous`) protects tool execution, but daemon mode
also needs basic transport-level auth (Phase D3) and a minimum tool-execution
sandbox (Phase D4) before any non-TUI channel (Phase G) is wired to it.

```
                     ┌─────────────────────────────────────────┐
                     │              Daemon Mode                 │
                     │                                           │
  Desktop UI ───┐    │   ┌───────────────────────────────────┐  │
  Web UI ───────┼────┼──►│     apps/server (local API)         │  │
  Telegram ──────┘    │   │  auth: local token (min bar)        │  │
                     │   └──────────────┬──────────────────────┘  │
                     │                  ▼                          │
                     │        ┌──────────────────┐                 │
                     │        │  @hachimi/core    │  ← single      │
                     │        │  (one instance)    │    source of   │
                     │        └──────────────────┘    truth         │
                     └─────────────────────────────────────────┘

                     ┌─────────────────────────────────────────┐
                     │             Embedded Mode                 │
                     │   apps/tui (interactive) ──┐               │
                     │   print/JSON mode ──────────┼──► @hachimi/core │
                     │   scripts / tests ──────────┘   (in-process)  │
                     └─────────────────────────────────────────┘
```

Both modes construct `@hachimi/core` through the same `createAppContext()` /
SDK entry point — the only difference is what sits in front of it. This keeps
the "core is channel-agnostic" principle intact rather than special-casing
daemon mode inside core.

## Portable Memory: Export/Import Bundle (P1)

"Local-first" and "migratable" are in tension if taken too literally — a raw
SQLite file copied between machines is fragile across schema versions and
platform-specific extensions (e.g. `sqlite-vec` builds are not always
binary-portable). So we separate two concerns that are easy to conflate under
one "Storage Layer" label:

1. **Runtime store** — whatever is fastest to query while the daemon/embed is
   running (file-backed JSON today, SQLite + vector store from Phase B on).
   Implementation detail, allowed to change.
2. **Portable bundle** — a versioned, engine-independent export format that is
   the actual unit of migration and backup (Phase E). This is the thing a user
   moves to a new machine, not the raw database file.

Bundle requirements:
- Explicit schema version field; the import path must know how to upgrade an
  older bundle, not just reject it.
- Contains all four memory layers, session history, and skill-usage state —
  everything that makes the assistant "know" the user, not just long-term
  facts.
- Export/import is a first-class command, not an afterthought — the same
  spirit as the `sk export` idea already planned for `skillfs`, applied here
  to memory instead of skills.
- Import is additive-with-conflict-resolution by default (merge, don't
  silently overwrite), since a user might be consolidating two machines' worth
  of history rather than doing a clean move.

## Unified Extension Registry (P3)

Tools, skills, MCP, and providers can look like four separate systems arriving
in different phases, but three of them share the same underlying shape:
"register a named capability with a short description for the model, resolve
to full content/execution on demand, gate by permission." Designing one shared
pattern (Phase F) avoids re-deriving it three times and avoids MCP support
looking bolted-on when it arrives.

Proposed shared shape (conceptual, not a literal current-code type):

```ts
interface CapabilitySource<T> {
  list(): CapabilityDescriptor[];       // short form, goes in system prompt
  resolve(name: string): Promise<T>;    // full form, loaded on demand
  permission(name: string): PermissionLevel;
}
```

- `ToolRegistry` and `SkillRegistry` already implement something close to this
  shape independently. Phase F's job is to converge them onto one interface.
- An MCP client becomes another `CapabilitySource<ToolDefinition>` —
  external MCP servers are just another place tools come from, not a parallel
  system with its own registration path.
- Provider selection (Phase C's `ProviderTransport`) is a different kind of
  capability (one active at a time, not "many registered and callable"), so it
  does *not* fit the same interface — worth stating explicitly so a future
  contributor doesn't try to force it in.
- Skills-as-installable-packages (Pi/Grok-Build pattern) becomes "a
  `CapabilitySource` that discovers entries from installed npm/git packages"
  rather than a separate loading mechanism from in-repo skills.

## Personalization: Two Tiers, Not One (P2)

"The assistant gets better at knowing you" conflates two different things with
very different maturity requirements:

- **Tier 1 — Consolidation (foundational, Phase B).**
  Deduplication, importance decay, session summarization —
  `MemoryManager.cleanup()`'s existing `deduplicate()`/`prune()`/
  `summarizeSession()` are early versions of this. Phase B's embedding-based
  retrieval is also Tier 1. This tier is solid *before* Phase F/I, not after
  — it's the mechanism, not the "feature."
- **Tier 2 — Self-directed skill/behavior evolution (advanced, Phase I).**
  The agent proposing new skills from repeated patterns, proactive triggers,
  sub-agent delegation. Hermes-agent's `hermes-agent-self-evolution` idea
  (evaluate → propose → gate → adopt) is the relevant reference here, and it
  correctly stays late: it depends on Phase F's hooks and a mature enough
  Tier 1 to have good signal to learn from.

## High-level Overview (current + planned)

```
┌───────────────────────────────────────────────────────────────────────┐
│         Clients: TUI (embedded) · Desktop · Web · Telegram bridge      │
│         (Desktop/Web/Telegram are daemon clients — see Runtime Topology)│
└──────────────────────────────┬──────────────────────────────────────┘
                                │  IncomingMessage / OutgoingMessage
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                            Core Harness  (@hachimi/core)                │
│                                                                         │
│  ┌────────────┐   ┌────────────────┐   ┌───────────────────────────┐  │
│  │ Agent Loop │◄──┤ Context Builder│◄──┤  Capability Registries     │  │
│  │  (done,    │   │  (done, needs  │   │  Tools · Skills · MCP      │  │
│  │  blocking)  │   │  cache-stable  │   │  (converging on one shape) │  │
│  └─────┬──────┘   │  rework)        │   └───────────────────────────┘  │
│        │          └────────────────┘                                  │
│        ▼                                                               │
│  ┌────────────┐   ┌────────────────┐   ┌───────────────────────────┐  │
│  │   Tools    │   │  Permissions   │   │   Hooks (planned)          │  │
│  │  Registry  │◄──┤  (unify types) │   │   (Tier 2 personalization  │  │
│  │  (done)    │   └────────────────┘   │    depends on this)        │  │
│  └─────┬──────┘                        └───────────────────────────┘  │
│        │                                                               │
│        ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │        Hierarchical Memory + Consolidation Loop (Tier 1)          │  │
│  │   Working → Session → Long-term → Archival                       │  │
│  │   Retrieval: substring → embedding (Phase B)                      │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│        │                                                               │
│        ▼                                                               │
│  ┌────────────┐        ┌───────────────────────────┐                  │
│  │  Session   │        │  LLM Provider Transport    │                  │
│  │  Manager   │        │  (single active provider,   │                  │
│  │  (done)    │        │   swappable, not a registry) │                │
│  └────────────┘        └───────────────────────────┘                  │
└──────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│      Runtime Store (file/SQLite+vector, impl detail, can change)       │
│      Portable Bundle (versioned export/import — the migration unit)    │
└───────────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Core is Channel-Agnostic
`@hachimi/core` has zero knowledge of TUI, HTTP, or messaging platforms. All
channels convert native input into `IncomingMessage` and receive
`OutgoingMessage`. In daemon mode this boundary sits inside `apps/server`;
in embedded mode it sits inside whatever process instantiates core directly.
Either way, core itself never special-cases a channel.

### 2. Hierarchical Memory (Tier 1 personalization mechanism)
| Layer     | Lifetime       | Purpose                               | Storage today        |
|-----------|----------------|----------------------------------------|-----------------------|
| Working   | Current turn   | Immediate conversation context         | In-memory             |
| Session   | Single session | Summaries, key decisions                | `data/memory.json`    |
| Long-term | Permanent      | User preferences, habits, facts         | `data/memory.json`    |
| Archival  | Permanent      | Documents, notes, generated artifacts   | Planned (file+vector) |

**Current gap**: `MemoryManager.search()` does keyword/substring matching, not
semantic retrieval. Phase B replaces this with embedding-based retrieval while
keeping the four-layer model unchanged. This is foundational to P2, not
optional polish.

### 3. Lazy Skills, Converging Toward a Shared Registry Shape
System prompt carries only a one-line description per skill; full instructions
+ associated tools load on activation. Phase F converges this with
`ToolRegistry` and an MCP client onto one `CapabilitySource` shape (see above),
and adds installable skill packages (Pi/Grok-Build pattern).

### 4. Provider Transport Abstraction (hermes-inspired)
Today `LLMProvider` has exactly one implementation
(`agent/providers/openai-compatible.ts`). Hermes-agent's `ProviderTransport`
pattern — one abstract contract, concrete transports per API shape — is the
target shape (Phase C). Note this is deliberately *not* folded into the
`CapabilitySource` registry pattern above: only one provider is active per
session, so it's a strategy/swap point, not a many-registered-capabilities
list.

### 5. Prompt-Cache Stability (hermes-inspired)
Hermes-agent treats this as one of the two properties shaping almost every
design decision: *a long-lived conversation reuses a cached prefix every
turn*. Our `ContextBuilder` currently violates this by rebuilding the whole
prompt every turn with content whose position shifts. Phase B fixes ordering
so static blocks (identity, tool/skill descriptions) form a stable prefix, and
only genuinely variable content (retrieved memories, active skill, recent
history) sits after a clear boundary. This matters more, not less, once a
daemon is serving multiple concurrent sessions (Phase D/G) — cache misses
multiply across every connected client.

### 6. Minimal Core, Optional Permission Layer, Now Also Transport Auth + Sandbox
Pi's no-built-in-permissions stance is legitimate for a single-user CLI tool.
Hachimi keeps its permission skeleton because P2's proactive behavior needs an
in-process approval gate. Daemon mode (P4) adds two further, independent
requirements on top: transport-level authentication (Phase D3) and a
tool-execution sandbox (Phase D4), since more than one untrusted-ish client (a
Telegram bridge, a browser tab) may now reach the same core. These are three
different layers and should not be conflated into one permission system.

### 7. Headless First, Multiple Entry Modes
Pi ships interactive / print-JSON / RPC / SDK modes; Grok Build separates
`leader` / `stdio` / `headless` entry points from the TUI. Hachimi's embedded
mode (Phase C) and daemon mode (Phase D) together cover this same ground:
embedded-print for scripts/cron, daemon+API for everything else.

### 8. Extension Points Without Modifying Core
Hooks remain the mechanism Tier 2 personalization depends on. Phase F (hooks)
is a hard prerequisite for Phase I, because Tier 2 (self-directed skill
evolution) cannot exist without them.

## Known Technical Debt (as of this writing)

1. **Duplicate permission types.** `types/index.ts` defines both
   `PermissionLevel` and `ToolPermission`; only the latter is read at runtime.
   Unify before building further permission UI. (Phase B1)
2. **Context builder is not prompt-cache stable.** See principle 5. (Phase B2)
3. **`MemoryManager.search()` is keyword matching, not semantic.** See
   principle 2 / Tier 1 personalization. (Phase B3)
4. **`packages/storage` has both `file-store.ts` and `sqlite-store.ts`, but
   only the file store is wired into `MemoryManager`**, and neither yet has a
   defined portable bundle export path. (Phase B3, Phase E)
5. **`packages/channels/{api,cli}` are empty package scaffolds** — no `src/`
   yet, and `apps/server` has no implementation. Given the daemon-mode
   requirement above, this is a higher-priority gap than it looks at first
   glance. (Phase D)
6. **No transport-level auth or tool-execution sandbox exists anywhere yet.**
   Not a bug today (nothing listens on a network port), but must land before
   Phase G wires up a Telegram bridge or web client. (Phase D3, D4)

## Key Interfaces

See `packages/core/src/types/index.ts` for current definitions.

- `IncomingMessage` / `OutgoingMessage` — channel protocol boundary
- `ToolDefinition` — tool registration + permission classification
- `SkillDefinition` / `SkillContent` — lazy skill contract
- `MemoryAccess` / `MemoryEntry` — how the agent reads/writes memory
- `LLMProvider` — today single-shape, becoming a transport interface in Phase C
- `CapabilitySource<T>` — proposed, not yet in code; the target shape Tools/
  Skills/MCP converge on in Phase F

## Module Boundaries

- **Agent** (`core/src/agent`): pure reasoning + tool-calling loop. No I/O
  beyond the injected `LLMProvider`.
- **Context** (`core/src/context`): assembles the system prompt; the one place
  prompt-cache discipline is enforced.
- **Memory** (`core/src/memory`): four-layer state + Tier 1 consolidation.
- **Session** (`core/src/session`): multi-turn history, separate from
  long-term memory by design.
- **Skills / Tools** (`core/src/skills`, `core/src/tools`): converging on
  `CapabilitySource`.
- **Channels** (`packages/channels/*`, `apps/tui`, `apps/server`): pure
  adapters. `apps/server` additionally hosts the daemon-mode canonical core
  instance, transport auth, and the tool-execution sandbox boundary.

## Implementation Order

See `ROADMAP.md` for the full phase plan, including the tutorial chapter
mapping. At a glance:

1. Phase A — Foundation~~ (done, published as L2 chapter 1)
2. Phase B — Foundation debt + SQLite/vector memory + token accounting
3. Phase C — Provider transport abstraction + embedded/headless modes
4. Phase D — Daemon mode + minimum sandbox + transport auth
5. Phase E — Portable memory bundle
6. Phase F — Unified extension registry (tools/skills/MCP), hooks
7. Phase G — Real channels: Telegram + REST API
8. Phase H — Desktop client
9. Phase I — Tier 2 personalization (self-directed skills, sub-agents, scheduling)
10. Phase J — Hardening (sandbox maturity, auth completeness, bundle security)
