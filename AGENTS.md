# Hachimi

Local-first **personal AI assistant harness** (TypeScript monorepo, pnpm).
One `HarnessRuntime` serves TUI, CLI, Web, Telegram, sub-agents, and schedulers — multi-surface, single brain.

Not a coding-only agent and not a multi-tenant cloud platform.
The assistant may model the user; it must not impersonate the user or silently rewrite identity.

Long-form design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Public API: [`docs/API.md`](docs/API.md) · Human product: [`docs/PROJECT.md`](docs/PROJECT.md) · Design System: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)

---

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm smoke:mock
```

App entrypoints follow root `package.json` / README (`dev:server`, `dev:tui`, filters, etc.). Prefer documented scripts over ad-hoc `tsx` paths.

Before finishing a change: **`pnpm typecheck` and `pnpm test` green**. Add or update tests for harness behavior you touch.

---

## Hard rules (architecture)

1. **Single brain** — Channels call `HarnessRuntime.execute()` (or the documented factory). Do not create a second Agent + Memory stack per surface.
2. **Public imports only** — From `apps/*` and `packages/channels/*`, import `@hachimi/core` public exports only. No deep `@hachimi/core/src/...` imports.
3. **Tool pipeline** — All tool runs go through `ToolRegistry.execute` (circuit breaker → arg check → permission/`confirm` → pre-hook → timeout sandbox → post-hook). Agent must pass `{ confirm, onToolApproval, hooks, sessionId }`. Never bypass the registry from the agent loop.
4. **Permissions** — `safe` / `needs_confirm` / `dangerous`. Non-TUI channels need an explicit policy (deny / allow-safe / allowlist), not assumed human approval.
5. **Context** — Keep ContextBuilder static prefix stable (identity → skills → tools); put volatile facts (e.g. current time) in the dynamic region; truncate tail-only.
6. **Capability growth** — Skill proposals stay pending until explicit accept. No silent skill install. No automatic SOUL/identity rewrite.
7. **Sub-agents** — Narrow delegation only: prefer tool allowlists, block nested `delegate_subagent`, set budgets; return summaries to the parent. Not a swarm framework.
8. **Sandbox honesty** — In-process timeout + buffer + PathJail are real; do not claim process/docker isolation unless implemented and tested. Wire PathJail into any new filesystem tools.
9. **Memory defaults** — No demo/seed memory unless `--demo` or explicit env. Portable Bundle schema and merge semantics are product features — do not break them casually.
10. **Design System single source of truth** — All Web/Desktop GUI surfaces must conform to [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) tokens (Light theme default, Ink-Teal accent `--primary: oklch(0.48 0.09 198)`, document-flow assistant messages, control heights 32/40/48, quiet hairline borders). No radial dark gradients or glassmorphism AI chrome in production UI.

---

## Documentation workflow (TASK / ROADMAP / archive)

Agents **may** update planning docs when the user asks to complete a phase, close a milestone, or explicitly maintain backlog. Do not churn docs on every tiny commit.

| File | Role |
|------|------|
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phase-level plan and intended order |
| [`docs/TASK.md`](docs/TASK.md) | **Active** backlog only (current focus) |
| [`docs/archive/`](docs/archive/) | Completed phase write-ups |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stable design; update when behavior/contracts change |

**When a phase or major checklist item is actually done (code + tests):**

1. Ensure acceptance criteria are met (`pnpm test`, relevant smoke/evals if applicable).
2. Move the completed phase section from `TASK.md` into a new or existing file under `docs/archive/` (e.g. `PHASE_H_TASK.md`), with a short “what shipped / known limits” note — mark **MVP** vs hardened honestly.
3. Check off the matching items in `ROADMAP.md` (or add a one-line status if the roadmap structure differs).
4. **Pull the next priorities from `ROADMAP.md` into `TASK.md`** as the new active list; keep `TASK.md` short.
5. If public API or harness contracts changed, update `docs/API.md` and/or `ARCHITECTURE.md` in the same effort.
6. Do not leave `TASK.md` and `ROADMAP.md` contradicting each other.

**If code and docs disagree:** trust **code + tests**, then fix docs. Never implement a feature solely because an outdated checkbox says so.

---

## Coding standards

- **Language:** TypeScript, ESM, pnpm workspaces. Match existing naming and file layout in the package you edit.
- **Style:** Follow repo Biome/tsc settings; do not invent a parallel formatter config in-tree without need.
- **Exports:** New core capabilities surface through `packages/core/src/index.ts` (or the package’s public entry) when apps must use them.
- **Errors:** Prefer controlled failure messages inside `HarnessRuntime.execute`; do not take down the daemon on a single turn error.
- **Logging:** Prefer clear English for new logs and internal diagnostics; user-visible assistant copy may be Chinese where the product is Chinese.
- **Tests:** Vitest colocated as `*.test.ts`. Harness changes (permissions, hooks, circuit breaker, runtime.execute) should include or extend unit tests.
- **Comments:** Explain non-obvious invariants (“why”), not narration of obvious code. Avoid large commented-out blocks.
- **Dependencies:** Do not add dependencies unless required; prefer existing workspace packages.

---

## Security checklist (when touching tools / server / channels)

- Non-interactive paths must not auto-approve `dangerous` without an explicit policy.
- Filesystem tools: resolve paths through PathJail (or equivalent); default deny workspace escape.
- Daemon: prefer authenticated API (secret); do not weaken CORS to “reflect any origin” for convenience.
- Bundles may be backups — avoid writing secrets into export payloads without review.

---

## Good targets vs avoid

**Good:** permission policies for channels; sub-agent allowlist/budget; honest scheduler/cron; F5 accept E2E; context clock; default API secret; bundle fixtures; eval cases in `packages/evals`; thin assistant tools with PathJail; minimal SOUL/Profile injection with human control.

**Avoid unless requested:** Desktop client (F1); multi-tenant remote daemon; full multi-agent swarm; silent skill install; auto SOUL edits; deep core imports from apps; documenting unimplemented isolation as done.

---
