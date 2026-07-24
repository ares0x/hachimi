# Structural Refactor Plan

> Verified against `main` @ `54198c5` (Phase A + Phase B done, Phase C1 done,
> C2–C6 pending). This is a cleanup pass, not a new roadmap phase — everything
> below fixes debt that already exists in shipped code, and should land before
> Phase D introduces `apps/server` as a second consumer of `@hachimi/core`.
> Doing this now means the daemon gets a clean public API from day one instead
> of copying the TUI's deep-import workaround.

## Why now, specifically

`apps/server` is still an empty package stub. The moment it becomes real
(Phase C4/D1), it will need everything `apps/tui` currently reaches for via
`../../../packages/core/src/...` — `SessionManager`, `SkillRegistry`,
`ProviderRegistry`, the builtin skills. If the public export surface isn't
fixed first, the daemon either repeats the same deep-import shortcut or the
two apps diverge on how they construct a runtime. This is the concrete reason
to do this cleanup before Phase D, not after.

## Confirmed issues, in fix order

### 1. `@hachimi/core`'s public `index.ts` under-exports (root cause of #2)
**File**: `packages/core/src/index.ts`

Currently exports only `Agent`, `ToolRegistry`, `ContextBuilder`,
`OpenAICompatibleProvider`, `MockLLMProvider`, plus `export *` from
`types/index.ts` and `memory/index.ts` (which is how `MemoryManager` sneaks
through). Missing: `SessionManager`, `SkillRegistry`, `ProviderRegistry` +
`ProviderType`, `AnthropicProviderTransport`, and any path to the builtin
skills.

**Fix**: add to `packages/core/src/index.ts`:
```ts
export { SessionManager } from "./session/manager.js";
export { SkillRegistry } from "./skills/registry.js";
export { ProviderRegistry } from "./agent/providers/transport.js";
export type { ProviderType } from "./agent/providers/transport.js";
export { AnthropicProviderTransport } from "./agent/providers/anthropic.js";
```
Also create `packages/core/src/skills/builtin/index.ts` (see #3) exporting
`writingSkill`, `summarySkill`, and re-export it from the package root:
```ts
export * as builtinSkills from "./skills/builtin/index.js";
```

### 2. Deep relative imports in `apps/tui/src/app-context.ts`
**File**: `apps/tui/src/app-context.ts`, lines 7–16

Replace:
```ts
import { Agent } from "../../../packages/core/src/agent/agent.js";
import { ToolRegistry } from "../../../packages/core/src/tools/registry.js";
import { MemoryManager } from "../../../packages/core/src/memory/manager.js";
import { SessionManager } from "../../../packages/core/src/session/manager.js";
import { SkillRegistry } from "../../../packages/core/src/skills/registry.js";
import { writingSkill } from "../../../packages/core/src/skills/examples/writing.js";
import { summarySkill } from "../../../packages/core/src/skills/examples/summary.js";
import { MockLLMProvider } from "../../../packages/core/src/agent/llm.js";
import { ProviderRegistry } from "../../../packages/core/src/agent/providers/transport.ts";
import { ContextBuilder } from "../../../packages/core/src/context/builder.js";
```
With:
```ts
import {
  Agent,
  ToolRegistry,
  MemoryManager,
  SessionManager,
  SkillRegistry,
  MockLLMProvider,
  ProviderRegistry,
  ContextBuilder,
  builtinSkills,
} from "@hachimi/core";
```
Note the stray `.ts` extension on the `ProviderRegistry` import (line 15,
`transport.ts` instead of `transport.js`) — inconsistent with every other
import in the file. Worth double-checking the build doesn't already have a
silent problem here (depends on `moduleResolution` in `tsconfig.json`); fixed
automatically once this import is replaced with the package-level one.

This is a mechanical, low-risk change **after** #1 lands (it will not compile
before that, since `SessionManager`/`SkillRegistry`/`ProviderRegistry` aren't
exported yet).

### 3. `skills/examples/` → `skills/builtin/`
**Files**: `packages/core/src/skills/examples/writing.ts`,
`packages/core/src/skills/examples/summary.ts`

Move to `packages/core/src/skills/builtin/writing.ts` and
`.../builtin/summary.ts`, add a barrel `skills/builtin/index.ts`. Update the
two import sites (which after #2 is just the one line in `app-context.ts`
importing from `@hachimi/core`).

### 4. Provider naming: separate vendor/protocol from model family
**Files**: `packages/core/src/agent/providers/transport.ts`,
`packages/config/src/index.ts`, `config.example.json`

Today `"claude"` and `"anthropic"` are two `ProviderType` values that resolve
to the same transport — a model-family name is standing in as a sibling of
vendor names like `deepseek`/`qwen`. Minimal fix that doesn't require a
breaking rename:
- Keep `ProviderType` as the on-the-wire compatibility union (don't break
  existing `config.json` files that say `"provider": "claude"`).
- Internally, treat `"claude"` as a **deprecated alias** for `"anthropic"`
  inside `ProviderRegistry.create()`, not a first-class case — i.e. normalize
  `"claude"` → `"anthropic"` at the top of `create()` before the switch, so
  the switch itself only has one entry per real transport.
- In `buildEnvDefaultProviders()` (`packages/config/src/index.ts`), drop the
  duplicate `claude:` block that's byte-for-byte identical to `anthropic:`
  (lines 82–86) — it's dead duplication once the alias normalization above
  exists.
- Document in a code comment: `provider` = which transport/vendor to talk to;
  `model` = the specific model string sent in the request body. Don't add
  new provider keys for model families going forward (e.g. don't add a
  `"gpt5"` provider key — that's a `model` value under `"openai"`).

### 5. Config legacy flat-field sunset path
**File**: `packages/config/src/index.ts`

The flat legacy fields (`llm.apiKey`, `llm.model`, `llm.baseURL`,
`llm.openaiApiKey`, `llm.deepseekApiKey`, `llm.anthropicApiKey`, etc.) are a
deliberate read-compat bridge, not an accident — `saveConfig()` already only
ever writes the new `providers` record. Two small changes make this safer
without a breaking migration right now:
- Add `@deprecated` JSDoc to each flat field in the `HachimiConfig.llm` type,
  pointing at `getActiveProviderConfig()`.
- Grep the codebase for any remaining direct reads of
  `config.llm.apiKey`/`.model`/`.baseURL` outside of the backward-compat
  mirror assignment in `loadConfig()` itself, and switch them to
  `getActiveProviderConfig(config)`. (At last check, `app-context.ts`'s
  `getStatus()` already correctly uses `getActiveProviderConfig` — good
  precedent to point new code at.)
- Actual removal of the flat fields is a Phase E concern (it's a breaking
  config-format change, and Phase E is already building versioned
  migration tooling for the portable memory bundle — reuse that machinery
  for a config-schema bump instead of building a second migration path).

### 6. `ChannelType` closed union → open type
**File**: `packages/core/src/types/index.ts`, lines 12–19

Currently:
```ts
export type ChannelType =
  | "cli" | "desktop" | "api" | "telegram" | "wechat" | "slack" | "system";
```
This bakes unbuilt channels (`wechat`, `slack`) into core's type surface —
exactly the coupling `IncomingMessage`/`OutgoingMessage` were designed to
avoid. Change to:
```ts
/** Known channel identifiers, for editor autocomplete only — not enforced. */
export type KnownChannelType =
  | "cli" | "desktop" | "api" | "telegram" | "system";

/** Core treats this as an opaque string; specific channels define their own values. */
export type ChannelType = KnownChannelType | (string & {});
```
This keeps autocomplete for the channels that exist today, drops `wechat`/
`slack` (add them back only when actually building them, from within the
channel's own package, not core's types), and stops core from needing an edit
every time a new channel is added — directly relevant once Phase G adds
Telegram for real and any future channel after that.

### 7. Extract `app-context.ts`'s growing responsibilities
**File**: `apps/tui/src/app-context.ts`

Not urgent yet (single ~240-line file), but cheap to do now and prevents the
"god object" trajectory both pasted analyses flagged. Extract, without
renaming `createAppContext` itself yet (see "Deferred" below):
- `createLLM()` → `apps/tui/src/runtime/llm-factory.ts` (or, if `apps/server`
  will need the identical logic in Phase D, `packages/core/src/agent/llm-factory.ts`
  so both TUI and daemon share it instead of each reimplementing
  provider-fallback logic).
- `registerBuiltinTools()` → its own module; it's the kind of thing that will
  grow as more builtin tools are added.
- The hardcoded demo seed memory (`"用户的名字是小明，喜欢简洁的回答"` /
  `"用户正在开发一个叫 hachimi 的个人助理项目"`, lines 136–139) — this
  unconditionally inserts tutorial-flavored demo data into every real user's
  long-term memory on first run. Gate it behind an explicit `--demo` flag or
  `HACHIMI_SEED_DEMO_MEMORY=true` env var, off by default, so it doesn't ship
  as silent seed data in the product.

**Deferred, not now**: renaming `createAppContext()` to `createRuntime()`.
Both pasted analyses suggest this, and conceptually they're right that it's
doing composition-root work, not "context" work — but a rename now only
benefits one caller (the TUI). It becomes genuinely valuable once
`apps/server` (Phase D) needs the exact same factory — do the rename at that
point, when there are two real call sites to prove the new name and shape are
actually shared, not one call site plus a guess.

### 8. Clean up `scripts/`
**Files**: `scripts/chat.ts`, `scripts/test-phase1.ts`, `scripts/test-phase2.ts`

The README already flags `scripts/` as "历史脚本（逐步迁移到 apps）" — so this
isn't a new finding, just a nudge to close it out:
- `scripts/chat.ts` looks like it overlaps with Phase C2's planned embedded
  print/JSON CLI mode — worth checking whether it can become the seed for
  that `apps/cli` work instead of living in `scripts/` indefinitely.
- `test-phase1.ts` / `test-phase2.ts` — either promote to real Vitest files
  under the package they exercise, or delete if superseded by the Vitest
  suites that now exist under `packages/*/src/*.test.ts`.

## Sequencing

Do items 1–3 together (one is blocked on the other two ordering-wise: fix
exports, then fix imports, then rename the directory the imports now point
through). Items 4–6 are independent of each other and of 1–3, can be done in
any order. Item 7 is optional polish, do whenever convenient. Item 8 is
housekeeping, no dependencies.

None of this needs its own ROADMAP.md phase — it's cleanup within the existing
Phase C, and should be checked off before Phase C4 (`apps/server` becomes
real) starts, per the "why now" note at the top.

## Explicitly not doing right now

- Splitting `packages/core` into `packages/{agent,memory,session,skills,tools,providers}`.
  Revisit after Phase E's unified `CapabilitySource` registry settles — package
  boundaries should follow settled dependency direction, not the reverse.
- A `ModelClient` abstraction layer above `ProviderTransport`. `ProviderTransport`
  already provides the decoupling Agent needs; an additional layer has no
  corresponding variability to justify it today.
- Splitting `MemoryManager` into `MemoryStore`/`MemoryRetriever`/`MemoryWriter`/
  `MemoryPolicy`. Revisit if the file crosses roughly 400–500 lines or a second
  retrieval strategy is added.
- Renaming `Session`/session-memory to resolve the naming overlap both
  analyses noted. Valid observation, but a documentation clarification is
  cheaper than a rename right now — revisit if it actually causes a bug, not
  preemptively.
