# Hachimi Product Vision & Positioning

**Own the runtime. Work is real. Events are truth. Surfaces are views.**

Hachimi is a **local-first, model-agnostic personal agent runtime (harness)** that the user owns. The one first-class fact in the system is a **resumable, auditable line of execution** (internally: **Work**). The truth is an **append-only `RuntimeEvent` log**. Desktop, TUI, Telegram, and every other surface are **projections of that log** — never a second source of truth. Every capability is **mediated by policy** and stays **observable**. The product’s reason to exist is this **runtime layer** — not a chat shell, not a Coding CLI substitute.

Engineering red lines and contribution rules live in [`AGENTS.md`](../AGENTS.md). **Category, non-goals, and product vocabulary in this document take precedence** when they conflict with feature impulse.

---

## 1. Product category & three-tier architecture

Hachimi is not another chatbot shell or UI wrapper.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tier 3 — Surfaces (projections — never a second source of truth)             │
│   Desktop · Web · TUI/CLI · Telegram · API                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │  thin projections over RuntimeEvent
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tier 2 — Work-centered execution model                                       │
│   Work (goal · plan · status · uiKind · workspaceRoot?)                      │
│   RuntimeEvent (append-only) · Activity (projection) · Artifacts (results)   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │  single source of truth for execution
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tier 1 — Essential core: personal agent runtime (harness)                    │
│   HarnessRuntime · PermissionPolicy · PathJail / ToolSandbox                 │
│   ContextBuilder · SkillRegistry · TrajectoryCompressor · SkillProposalManager│
└─────────────────────────────────────────────────────────────────────────────┘
```

| Tier | Role |
|------|------|
| **1 — Runtime** | `HarnessRuntime` owns orchestration, context assembly, tool execution, permission checks, and experience extraction. Identity/SOUL (if present) is **context prefix**, not a second agent. |
| **2 — Execution model** | **Work** replaces pure chat threads as the first-class object. **Session** is an execution container underneath it, not the unit users manage. |
| **3 — Surfaces** | Desktop, Web, TUI, Telegram, API render the same underlying event stream; none holds independent product state. |

---

## 2. Five operating principles

### I. Work is real

A resumable, auditable **line of execution**. A casual question is a **lightweight** line; a folder-bound coding effort is a **heavier** one. **Same object type**; only weight and optional workspace binding differ.

### II. Events are truth

UI and model prompts are **projections** of the `RuntimeEvent` log, not the source of record. Large results **externalize** (blob + summary) rather than living only inside a chat bubble. The UI **must not** claim a side effect succeeded before the corresponding event confirms it.

### III. One brain, many surfaces

Every capability flows through `HarnessRuntime.execute()` (and related runtime APIs). There is **no second intelligence loop** in surface-specific code.

### IV. Capability is mediated

Tools go through **registry + policy + jail**. Skills that were learned from trajectories require **human review** before they run as normal capabilities. The **model is swappable** without changing the above.

### V. Human-in-the-loop evolution

The system may extract skill **candidates** from trajectories. Learned skills stay **`pending` proposals** — never auto-registered or injected into default prompts without explicit accept.

**Memory note:** lightweight **conversation** lines should be **conservative** about writing long-term memory; durable facts prefer explicit save, clear preference extraction, or user-visible control — not silent archival of every casual turn.

### VI. Determinism before probability

When a problem has a deterministic solution, prefer it over an LLM call — deterministic code is 100% predictable; a model call is not. This has been the practice throughout the project (`PathJail` boundary checks and `shell-ast-guard`'s command parsing are deterministic code, not "ask the model whether this path/command is safe") without ever being stated as a rule. Stating it now: when building a new skill or capability, default to the order **Code → CLI tool → structured prompt → full agent loop**, reaching for a more probabilistic layer only once the deterministic ones genuinely can't solve it.

---

## 3. Explicit non-goals

- **Not** the best Claude Code / Codex substitute — coding depth is not the axis Hachimi competes on.
- **Not** a feature-maximalist assistant supermarket or multi-persona stage — one runtime, optional narrow workers, not parallel personalities as the product center.
- **Not** “complete” only when bound to one vendor model — model choice is a **swap**, not an identity.
- **Not** an unauditable autonomous black box — autonomous action must be traceable to `RuntimeEvent` (and policy outcomes).

### How Hachimi learns from other projects

**Adopt mechanisms** (tool depth, interruption, log-as-projection, composability) from Pi, Maka, Claude Code, and similar harnesses.

**Do not adopt their category center** (e.g. library-only minimalism as the whole product, desktop-chat as the only frame, or repo-session-only scope as the world model).

Hachimi’s category center stays: **a runtime the user owns**, reachable from many surfaces.

---

## 4. What “done” looks like (user-perceived end state)

A standing **agent console** on the user’s machine:

- **Left:** recent lines (conversation / task / project)
- **Center:** this line’s process and results (activity, optional goal/plan, artifacts)
- **Right:** runtime state (running / waiting for approval / memory used / model)

Asking about a sick cat **feels like chat**. Opening a folder **feels like a project session**. Switch surface or switch model — **the line is still there**.

### Vocabulary softening

Internal model stays uniform; **labels** change with weight:

| Internal | User-facing (UI) | Character |
|----------|------------------|-----------|
| Work | **Conversation** | No goal pressure, no bound folder |
| Work | **Task** | Has a goal / sense of completion |
| Work | **Project** | Bound to `workspaceRoot` |
| Work (any) | Left rail: **Recent** | Mixed by time; groupable by kind |

**Planned fields (implementation contract):**

- `uiKind`: `"conversation" | "task" | "project"`
- `workspaceRoot?: string` — when set, tools/jail **prefer** this root for that line

Casual questions must not feel like “please justify this as a managed Work.” The ledger still records a line; the UI stays light.

### Success criteria (felt, not vanity metrics)

1. Feels like **owning a runtime on this machine**, not visiting another website.
2. **Recent lines on the left**, process in the center, **runtime state on the right**.
3. Kill the process / switch surface / switch model — **the line survives**.
4. Willing to let it touch files and run commands, because **policy and the ledger** are there.
5. Strong coding is one kind of **project line** — the product still stands without it.

---

## 5. Current state vs end state — verified, not self-reported

Ratings reflect **code/wiring checks**, not TASK.md checkboxes alone.

| Layer | State | Evidence / gap |
|-------|--------|----------------|
| Positioning docs | **Aligned** | AGENTS / README lead with personal agent runtime (harness) |
| `HarnessRuntime` single-brain | **Solid** | Multi-channel entry |
| Work model + API + CLI | **Solid** | First-class internally; **`uiKind` / `workspaceRoot` not landed yet** |
| `RuntimeEvent` log + recovery | **Solid** | File-backed; SQLite path exists |
| Policy + approval | **Solid** | Per-surface matrix is a real differentiator |
| Builtin tools | **Solid** | Streaming FS, grep, replace, shell, memory |
| Sandbox | **Solid, one real limit** | PathJail/ToolSandbox bind `workspaceRoot` **at construction** — **two concurrent Works on two folders** need per-Work sandbox or request-scoped root (harness change, not a UI tweak) |
| Memory retrieval | **Lightweight** | Lexical / n-gram style similarity — not “vector-grade” embeddings |
| Activity / Goal / Plan UI | **Further than often assumed** | Substantial components wired into the app render tree |
| Multi-surface MVP | **Solid** | TUI / Web / Desktop / Telegram / Daemon |
| Skill review loop | **Mechanism real** | Default path (“every completed line surfaces a proposal?”) still to harden |
| Portable memory bundle | **Solid** | Local export/import |
| Secrets at rest | **Gap** | API keys still plaintext in config-style storage |
| Per-capability threat notes | **Gap** | Memory / MCP / skills / channels deserve explicit notes |
| UI visual regression | **Gap** | No screenshot-diff / real-window smoke for Desktop–Web |
| Docs honesty | **Recurring** | README badges/clone must track repo rename (`hachimi-agent`); fix when wrong |

---

## 6. Operating discipline: verify the wire, not just the definition

A type, class, or component **existing** is not the same as it being **on the path a user or another surface actually exercises**.

Before marking work **done**:

1. Trace from a **real surface** (Desktop click, Telegram message, daemon HTTP, CLI).
2. Follow through to the **`RuntimeEvent` (and policy outcome)** that should result.
3. Prefer a test or manual script on that path — not only an isolated unit test of the piece.

---

## 7. Implication for near-term product work (derived, not a full roadmap)

Aligned with this vision, priority naturally falls on:

1. Land **`uiKind` + `workspaceRoot`** and UI vocabulary (**Recent / Conversation / Task / Project**).
2. **Open folder → project line** with jail/tools scoped to that root; plan **request- or Work-scoped sandbox** if concurrent multi-root is required.
3. Keep **conversation** UX light (no empty goal/plan chrome); keep **events lean** (summary + blob) as usage grows.
4. Close **docs/URL honesty** and continue **harness hardness** over category-center feature copies.

---

*This document is the product anchor. Features that do not reinforce Own the runtime / Work / Events / Surfaces should be deferred or rejected.*
