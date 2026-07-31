# Getting Started with Hachimi

Quickstart guide for developers who want to run, explore, and contribute to Hachimi.

## Prerequisites

- **Node.js** >= 22
- **pnpm** >= 9
- **Git**

## 5-Minute Quickstart

```bash
# 1. Clone
git clone https://github.com/hachimi-agent/hachimi.git
cd hachimi

# 2. Install
pnpm install

# 3. Launch TUI
pnpm dev:tui
```

Type `/config` in the TUI to configure your LLM provider (DeepSeek, Claude, OpenAI, etc.) and API key.

## What You Can Do

### Run the TUI

```bash
pnpm dev:tui
```

The Terminal UI gives you a full-screen interactive chat interface. Use `/help` to see available commands, `/status` to see system state, and `/provider` to switch LLM backends.

### Use the CLI

```bash
# One-shot chat
pnpm dev:cli -p "What is Hachimi?"

# JSON output
pnpm dev:cli -j -p "Describe Node.js in one sentence"

# With portable memory export
pnpm dev:cli --export ./my-backup.json
```

### Start the Daemon Server

```bash
pnpm dev:server
```

The daemon listens on `http://127.0.0.1:3700` and provides REST + SSE + WebSocket APIs. Add `HACHIMI_API_SECRET=my_token` for Bearer auth.

```bash
curl http://127.0.0.1:3700/health
```

### Run the Web UI

```bash
pnpm dev:web
```

Opens a minimal glassmorphism web interface on the daemon port.

### Run Tests

```bash
pnpm test
```

## Project Tour

| Path | Purpose |
|------|---------|
| `apps/tui/` | Terminal UI (Ink + React) |
| `apps/server/` | Daemon server (Fastify) |
| `packages/core/` | HarnessRuntime — the brain |
| `packages/config/` | Configuration & provider presets |
| `packages/storage/` | SQLite + File storage engines |
| `packages/shared/` | Shared utilities, i18n, errors |
| `packages/channels/` | CLI, API, Web, Telegram adapters |
| `docs/` | Architecture, design, roadmap |

## First Contribution

1. Look for issues labeled `good first issue`
2. Read [CONTRIBUTING.md](../CONTRIBUTING.md)
3. Run `pnpm lint && pnpm typecheck && pnpm test` before submitting
4. Open a PR with a clear description

## Next Steps

- [Architecture Overview](./ARCHITECTURE.md) — how Hachimi is structured
- [Design System](./DESIGN_SYSTEM.md) — design principles and patterns
- [Roadmap](./ROADMAP.md) — what's coming next
- [API Reference](./API.md) — `@hachimi/core` public API
