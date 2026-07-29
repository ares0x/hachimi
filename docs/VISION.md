# Hachimi Product Vision & Positioning

> **Hachimi is a local-first, model-agnostic personal agent runtime (harness).**

---

## 1. Product Category & Three-Tier Architecture

Hachimi is not another chatbot shell or UI wrapper. It is a robust personal agent runtime designed to orchestrate long-running work, tool execution, memory, and safety.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. User-Facing Assistant UX (Multi-Surface Projections)                      │
│    Desktop App (Electron) · Web UI · TUI · Telegram Bot · API               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ (Thin Projections over RuntimeEvent)
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. Work-Centered Execution Model                                             │
│    Work (Goals & Plans) · RuntimeEvent (Immutable Log) · Activity Timeline  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ (Single Source of Truth)
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Essential Core: Personal Agent Runtime (Harness)                         │
│    HarnessRuntime · PermissionPolicy · PathJail · ContextBuilder            │
│    SkillRegistry · TrajectoryCompressor · SkillProposalManager              │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Essential Runtime (The Engine)**: `HarnessRuntime` owns orchestration, context assembly, tool execution pipelines, permission checking, and experience extraction.
2. **Work-Centered Execution Model**: `Work` replaces pure chat threads as a first-class object. `Session` is merely an execution container.
3. **Assistant-like UX (Multi-surface Projections)**: Interfaces (Desktop, Web, TUI, Telegram, API) are thin adapters rendering projections of underlying runtime events.

---

## 2. Five Core Constitutional Principles

### I. Local-First & Portable
- All data, events, memory, and proposals remain local on the user's machine by default.
- Complete memory bundle export/import (`.bundle.json`) ensures full data ownership and portability across machines.

### II. Model-Agnostic & Vendor-Neutral
- Core logic, tool execution, and policy decision control flows never hardcode vendor-specific quirks into system prompts.
- Swapping LLM providers (`openai-compatible`, `anthropic`, `mock`) maintains identical control flows and safety guarantees.

### III. Deep Composability
- Tools, skills, connectors, extensions, and channels operate on uniform registration contracts.
- Zero second-loop execution paths: every capability flows through `HarnessRuntime.execute()`.

### IV. Trust, Safety & Transparency
- Every tool call executes through `PermissionPolicy` (`safe`, `needs_confirm`, `dangerous`) and `PathJail` / `ToolSandbox`.
- UI must never claim side effects succeeded until `RuntimeEvent` logs confirm completion.

### V. Human-in-the-Loop Evolution
- The system extracts skill candidates from work event trajectories (`TrajectoryCompressor`).
- All learned skills remain as `pending` proposals in `~/.hachimi/proposals/` and **must never** be registered or injected into prompts without explicit human approval (`acceptProposal`).
