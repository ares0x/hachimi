# Contributing to Hachimi

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

### Prerequisites

- Node.js >= 22
- pnpm >= 9
- Git

### Getting Started

```bash
# Clone the repo
git clone https://github.com/ares0x/hachimi.git
cd hachimi

# Install dependencies
pnpm install

# Run the TUI to verify everything works
pnpm dev:tui

# Run tests
pnpm test
```

### Monorepo Structure

```text
hachimi/
├── apps/
│   ├── tui/          # Terminal UI (Ink + React)
│   └── server/       # Daemon server (Fastify)
├── packages/
│   ├── core/         # HarnessRuntime — the brain
│   ├── config/       # Configuration & provider presets
│   ├── shared/       # Shared utilities & types
│   ├── storage/      # SQLite + File storage engines
│   └── channels/     # CLI, API, Web, Telegram adapters
├── docs/             # Design documents
└── package.json      # pnpm workspace root
```

Each package is a self-contained module. The `@hachimi/core` package is the central engine — most features start there.

## Development Workflow

### Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Lint
pnpm lint

# Auto-fix lint issues
pnpm lint:fix

# Format
pnpm format
```

### Type Checking

```bash
pnpm typecheck
```

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode (useful during development)
pnpm test:watch

# Smoke test (mock-only, no real API calls)
pnpm smoke:mock
```

### Before Submitting a PR

1. Run `pnpm lint` and fix any issues
2. Run `pnpm typecheck` and ensure no type errors
3. Run `pnpm test` and ensure all tests pass
4. Write or update tests for your changes
5. Keep PRs focused — one feature or fix per PR

## Pull Request Process

1. **Discuss first**: For significant changes, open an issue to discuss before coding.
2. **Branch**: Create a feature branch from `main` — use a descriptive name like `feat/xxx` or `fix/yyy`.
3. **Commit**: Write clear commit messages. Reference issues with `#123`.
4. **Test**: Add tests for new functionality. Update existing tests if behavior changes.
5. **PR description**: Explain what changed and why. Link related issues.
6. **Review**: All PRs require at least one review before merging.

## Architecture Conventions

- **Channels are thin**: Channel adapters (CLI, Web, Telegram) parse input → call `runtime.execute()` → render output. They don't contain business logic.
- **Core is the brain**: All agent logic, memory management, tool execution, and extension systems live in `@hachimi/core`.
- **Tools are capabilities**: Custom tools implement the `Tool` interface and are registered via `CapabilitySource`.
- **Storage is pluggable**: New storage backends implement the `Store` interface.

## Reporting Bugs

Use the [Bug Report](https://github.com/ares0x/hachimi/issues/new?template=bug_report.yml) template. Include:

- Hachimi version
- Channel (TUI / CLI / Web / Desktop / Telegram / API)
- Steps to reproduce
- Expected vs actual behavior
- Any relevant logs or screenshots

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). Please read it before participating.
