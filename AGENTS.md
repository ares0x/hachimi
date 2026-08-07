# AGENTS.md — Guidelines for AI Coding Assistants

Rules for agents and humans changing this repo. PRs that violate architecture
rules below will be rejected.

For product narrative, see `docs/VISION.md` and `docs/ARCHITECTURE.md`.

---

## 0. Product Orientation (CRITICAL)

Hachimi is a **local-first, model-agnostic personal agent runtime (harness)**.

- **Not** “another chatbot shell” or UI-only workbench.
- **Assistant-like UX** (multi-surface, memory, skills) is a *composition* of the runtime, not the definition of the product.
- **Primary objects**: `Work`, `RuntimeEvent`, tools, policy, context assembly.
- **Session** is an execution container; do not re-center product logic on “chat threads”.
- **Channels** (TUI, Web, Desktop, Telegram, API) are thin adapters over one brain: `@hachimi/core` / `HarnessRuntime`.

### Design Filters for Every Change

Prefer work that improves:

1. **Harness leverage** (loop, tools, context, policy) so swapping models still works.
2. **Composability** (providers, tools, skills, connectors, channels).
3. **Trust** (permissions, PathJail, audit events, portable/deletable data).
4. **Earned understanding** (memory + human-approved learned skills).

Deprioritize: extra Modes, parallel agent personalities, chat-chrome for its own sake,
or features that bypass `runtime.execute()`.

### Model-Agnostic

- Provider-specific behavior belongs in transport adapters, not in core prompts hard-coded to one vendor.
- Same Work + tools + policy must remain coherent when `activeProvider` changes (quality may differ; control flow must not collapse).

### Safety & Privacy

- Tools that touch the filesystem or shell **must** go through the registry pipeline (policy, PathJail, sandbox limits).
- Never invent a second execution path that skips permission or jail.
- UI may optimistically update *reversible metadata* (titles, archive flags). UI must **not** claim tool side effects succeeded until runtime events say so.
- User data stays local-first; export/import and deletion must remain possible.

---

## 1. Language Policy (CRITICAL)

**New features and code MUST default to English**: comments, commits, PRs, tool
descriptions, errors, CLI/TUI strings, `docs/` (except `README_CN.md` and fixtures).

User-facing strings: use i18n (`packages/shared` locales). Workflow:

1. Key in `I18nDictionary`
2. English in `en.ts`
3. Chinese in `zh-CN.ts`
4. `i18n().t("…")` in code

Exception: `// TODO: i18n` only for short-lived prototypes.

---

## 2. Architecture Rules

### Single Brain

```
Channel → parse input → HarnessRuntime.execute({ channel, … }) → render projection
```

- No business logic in channel adapters.
- No second Agent loop inside apps/desktop, apps/web, or channel packages.

### Public API Only

```typescript
// ✅
import { HarnessRuntime, createHarnessRuntime } from "@hachimi/core";

// ❌
import { Agent } from "@hachimi/core/src/agent/agent.js";
```

### Core Owns

- `HarnessRuntime` orchestration
- Agent loop (steer / followUp)
- Work + RuntimeEvent store and projections (Activity)
- Memory (as a **context source**, not a parallel product)
- Tool registry, policy, sandbox / PathJail
- Skills + skill proposals (pending until human accept)
- Hooks, MCP, portable bundle

### Work & Events

- Prefer extending Work / events / policy over new Session-centric APIs.
- Execution truth is append-only events; UI and model context are **projections** (context may compress; events must not silently rewrite history).
- Learned skills: write proposals as `pending`; **never** auto-register without accept.

### Tools

- Built-ins live under `packages/core/src/tools/builtin/` (domain folders).
- Every tool declares `permission`: `safe` | `needs_confirm` | `dangerous`.
- Pass real `channel` / surface into `execute` so `PermissionPolicy` applies.
- Large tool results: truncate or reference for the model; do not treat full blobs as both log and prompt without a policy.

---

## 3. Code Style

- Formatter / linter: Biome (`pnpm format`, `pnpm lint`)
- TypeScript strict; avoid `any` unless documented
- camelCase / PascalCase / kebab-case files as existing codebase
- No default exports except locale dicts and React components

---

## 4. Testing

- New features and bugfixes need tests
- `pnpm test` and `pnpm smoke:mock` before push
- Policy and channel surface behavior need coverage when touched

---

## 5. Commits & PRs

- English, imperative commits
- One concern per PR; describe *what / why / how tested*
- Call out any change to policy, jail, or event schema

---

## 6. File & Directory Layout

```
packages/core/src/
├── agent/           # loop, steer, followUp
├── context/         # ContextBuilder, compaction
├── events/          # RuntimeEvent store
├── work/            # Work manager, activity projection
├── memory/          # Four-layer state
├── runtime/         # HarnessRuntime, app context
├── tools/           # registry, policy, builtin/*
├── skills/          # registry, proposals, trajectory
├── sandbox/         # ToolSandbox, PathJail
├── extensions/      # hooks, MCP, packages
├── portable/        # memory bundle export/import
└── triggers/        # proactive (suggest-first; no silent dangerous ops)
```

---

## 7. Pre-Submit Checklist

- [ ] `pnpm lint` / `typecheck` / `test` / `smoke:mock`
- [ ] No deep imports; channels stay thin
- [ ] No execution path bypassing registry policy / jail
- [ ] New strings via i18n (EN + zh-CN)
- [ ] Work/events preferred over new Session-first surface
- [ ] Commits in English; PR explains impact on runtime if any
