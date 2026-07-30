# Contributing to Hachimi

Thanks for your interest in contributing to **Hachimi** — a local-first, model-agnostic personal agent runtime (harness).

Please review these guidelines before submitting code or opening pull requests.

---

## Product Vision & Principles

Hachimi is an **agent runtime and harness**, not just another chatbot UI shell.

When proposing changes, evaluate them against these **4 Design Filters**:

1. **Harness Leverage**: Enhance runtime loops, tool orchestration, context assembly, and policies so swapping LLM providers maintains full execution integrity.
2. **Composability**: Keep capabilities (providers, tools, skills, connectors, channels) modular and pluggable.
3. **Trust & Safety**: Enforce `PermissionPolicy`, `PathJail`, and audit logging. Never bypass tool permissions or sandbox checks.
4. **Earned Understanding**: Memory & human-approved learned skills (trajectory proposals remain `pending` until explicit human acceptance).

For full details, see [`docs/VISION.md`](./docs/VISION.md) and [`AGENTS.md`](./AGENTS.md).

---

## Development Setup

### Prerequisites

- Node.js >= 22
- pnpm >= 9
- Git

### Getting Started

```bash
# Clone the repository
git clone https://github.com/ares0x/hachimi.git
cd hachimi

# Install dependencies
pnpm install

# Run the TUI to verify setup
pnpm dev:tui

# Run test suite
pnpm test
```

### Monorepo Structure

```text
hachimi/
├── apps/
│   ├── desktop/      # Desktop Shell (Electron + React)
│   ├── web/          # Web SPA Client (React + Vite)
│   ├── tui/          # Terminal UI (Readline + React)
│   └── server/       # Daemon Server (Fastify + SSE + WS)
├── packages/
│   ├── core/         # HarnessRuntime — The brain (@hachimi/core)
│   ├── config/       # Configuration & provider presets
│   ├── shared/       # Shared i18n, logger, errors, types
│   ├── storage/      # SQLite + File storage backends
│   ├── ui/           # Shared React UI components (WorkList, ActivityTimeline)
│   ├── evals/        # Tri-tier Benchmark Evals framework
│   └── channels/     # Thin adapters (CLI, Telegram, API)
├── docs/             # Vision, Architecture, and API specifications
└── package.json      # pnpm workspace root
```

---

## Development Workflow

### 1. Language Policy (CRITICAL)

- **Code, comments, commits, PRs, and tool descriptions MUST default to English**.
- User-facing strings must use the i18n module (`packages/shared/src/i18n`).
- Add keys to `I18nDictionary` (`types.ts`), English in `en.ts`, and Chinese in `zh-CN.ts`.

### 2. Code Formatting & Linting

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Lint code
pnpm lint

# Auto-fix lint issues
pnpm lint:fix

# Format code
pnpm format
```

### 3. Type Checking

```bash
pnpm typecheck
```

### 4. Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Smoke test (mock mode, zero API cost)
pnpm smoke:mock

# Benchmark Evals suite
pnpm eval
```

---

## Pre-Submit Checklist

Before submitting a Pull Request, verify:

- [ ] Code compiles cleanly with `pnpm typecheck`
- [ ] Linter & Formatter pass with `pnpm lint`
- [ ] Full test suite passes with `pnpm test`
- [ ] Smoke tests pass with `pnpm smoke:mock`
- [ ] No deep imports from internal package paths (import only from `@hachimi/core` top-level)
- [ ] No execution path bypasses `PermissionPolicy` or `PathJail`
- [ ] Commit message is written in English (imperative mood, e.g., `Add tool sandbox timeout`)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). Please read it before participating.
