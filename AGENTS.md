# AGENTS.md — Guidelines for AI Coding Assistants

This file defines conventions and rules for AI agents (Copilot, Cursor, Claude, etc.) working on this codebase. Follow these or your PR gets rejected.

---

## 0. Language Policy (CRITICAL)

**New features and code MUST default to English.** This applies to:

- Source code comments (JSDoc, inline)
- Commit messages
- PR descriptions
- Tool descriptions and user-facing strings in `packages/core/src/tools/`
- Error messages in `packages/shared/src/errors.ts` and `packages/shared/src/constants/messages.ts`
- CLI output strings in `packages/channels/cli/`
- TUI text in `apps/tui/`
- Documentation in `docs/`
- All new files

**When Chinese is acceptable:**
- Test fixtures that represent Chinese user input
- The `README_CN.md` file (Chinese-only README)
- Comments explaining culturally-specific behavior (e.g., "Chinese date format differs from ISO")

### i18n Synchronization

When adding user-facing strings, you MUST use the i18n module:

```typescript
import { i18n } from "@hachimi/shared/i18n";  // or relative path as needed

// ✅ Correct — locale-aware
const msg = i18n().t("tool.my_tool.description");

// ❌ Wrong — hardcoded Chinese
const msg = "这是一个工具的描述";
```

**Workflow for adding new strings:**

1. Add the key to `packages/shared/src/i18n/types.ts` (`I18nDictionary` interface)
2. Add English text to `packages/shared/src/i18n/locales/en.ts`
3. Add Chinese text to `packages/shared/src/i18n/locales/zh-CN.ts`
4. Use `i18n().t("your.key")` in code

**If you skip i18n and hardcode Chinese**, your PR will be flagged. The only exception is rapid prototyping where you mark the string with `// TODO: i18n`.

---

## 1. Architecture Rules

### Channels are thin

```
Channel adapter (CLI/Web/Telegram) → input parse → runtime.execute() → output render
```

Never put business logic in channel adapters. All intelligence lives in `@hachimi/core`.

### No deep imports

External consumers import only from package top-level:

```typescript
// ✅ OK
import { HarnessRuntime } from "@hachimi/core";

// ❌ Forbidden
import { Agent } from "@hachimi/core/src/agent/agent.js";
```

### Core is the single source of truth

`packages/core/` owns:
- Agent orchestration
- Memory management
- Tool registry & execution
- Extension systems (hooks, skills, MCP)
- Portable memory

---

## 2. Code Style

- **Formatter**: Biome (`pnpm format`)
- **Linter**: Biome (`pnpm lint`)
- **TypeScript**: strict mode, no `any` unless genuinely unavoidable (document why)
- **Naming**: camelCase for variables/functions, PascalCase for classes/types, kebab-case for files
- **Imports**: no default exports except for locale dictionaries and React components

---

## 3. Testing

- New features require tests
- Bug fixes require regression tests
- Run `pnpm test` before pushing
- Smoke tests (`pnpm smoke:mock`) must pass — these test the full agent loop without real API calls

---

## 4. Commits & PRs

- Commit messages in English, imperative mood: "Add tool sandbox timeout" not "Added tool sandbox timeout"
- PR descriptions: what changed, why, testing notes
- Keep PRs focused — one feature or fix per PR

---

## 5. Tools & Capabilities

New built-in tools go in `packages/core/src/tools/builtin/`. External/custom tools use `CapabilitySource<T>` registration.

All tools must declare a permission level:
- `"safe"` — auto-execute
- `"needs_confirm"` — ask user once
- `"dangerous"` — sandboxed with timeout + buffer cap

---

## 6. File Organization

```
packages/core/src/
├── agent/          # Agent loop, steer(), followUp()
├── extensions/     # CapabilitySource, HookRegistry, McpClient, SkillPackage
├── portable/       # Memory export/import/migration
├── runtime/        # HarnessRuntime orchestrator
├── sandbox/        # ToolSandbox
└── tools/          # Built-in tool implementations
    └── builtin/    # calc, datetime, fs (read/write/delete/list), shell
```

---

## 7. Quick Checklist Before Submitting

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm smoke:mock` passes
- [ ] New user-facing strings use i18n (English default + Chinese locale)
- [ ] No deep imports added
- [ ] Commit messages in English
- [ ] PR description explains what and why
