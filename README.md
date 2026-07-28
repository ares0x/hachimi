<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="resources/hachimi-logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="resources/hachimi-logo-light.png">
    <img alt="Hachimi Logo" src="resources/hachimi-logo-light.png" width="560">
  </picture>
</p>

<p align="center">
  <strong>Your personal AI assistant that runs anywhere, remembers everything, and grows with you.</strong>
</p>

<p align="center">
  <a href="https://github.com/ares0x/hachimi/actions"><img alt="CI" src="https://github.com/ares0x/hachimi/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/ares0x/hachimi/discussions"><img alt="Discussions" src="https://img.shields.io/badge/discussions-welcome-brightgreen"></a>
</p>

<p align="center">
  <strong>English</strong> | <a href="README_CN.md">中文</a>
</p>

<!-- _Demo GIF coming soon — [screenshot placeholder]_ -->

> **tl;dr**: Hachimi is a local-first AI assistant framework. Chat with it in your terminal, web browser, or Telegram. It remembers your preferences, runs tools on your machine, and you own 100% of your data.

---

## Why Hachimi?

Most AI assistants lock you into a cloud service. Hachimi runs **on your machine**, stores everything **locally**, and lets you **switch between LLM providers** anytime (DeepSeek, Claude, OpenAI, Qwen, Kimi, Ollama — or any OpenAI-compatible API).

It's not just a chatbot — it's a **harness**: a framework for building AI-powered workflows with tools, memory, and extensions. Think of it as the missing runtime between "raw LLM API calls" and "a full AI application."

---

## What Can Hachimi Do?

- 💬 **Chat** via TUI terminal, CLI, Web UI, or Telegram — same brain, all surfaces
- 🧠 **Remember** your preferences, habits, and facts across sessions (with automatic dedup & decay)
- 🔧 **Run tools** on your machine — files, shell commands, calculations, and custom tools you define
- 🔌 **Extend** with MCP servers, custom skills, and lifecycle hooks
- 📦 **Export & migrate** your memory as a portable bundle with checksum verification
- 🏗️ **Embed** as an npm package (`@hachimi/core`) into your own Node.js apps

---

## Key Features

| Category | What You Get |
|----------|-------------|
| 🏠 **Local-first** | All data lives on your machine. SQLite + file storage. No cloud dependency. |
| 🔄 **Multi-provider** | DeepSeek, Claude, OpenAI, Qwen, Kimi, Ollama, and any OpenAI-compatible API. Switch mid-conversation. |
| 🧠 **4-tier memory** | Working → Session → Long-term → Archival. Embedding-based retrieval with auto dedup. |
| 🖥️ **Multi-surface** | TUI, CLI, Web, Desktop, Telegram — one brain, many faces. Daemon mode keeps state in sync. |
| 🛠️ **Tool system** | Built-in file ops, shell, calc, datetime. Extend with custom tools. Sandboxed execution for dangerous ops. |
| 🔗 **MCP native** | Connect any MCP-compatible server as a tool source. |
| 🔐 **Portable memory** | `HachimiBundleV1` with SHA-256 checksum. Export, import, merge, migrate across machines. |
| 🎣 **Hooks & skills** | Lifecycle hooks (`preToolCall`, `postToolCall`). Lazy-loaded skills from `~/.hachimi/skills/`. |

---

## Quick Start

```bash
# Prerequisites: Node.js >= 22, pnpm >= 9
git clone https://github.com/ares0x/hachimi.git
cd hachimi
pnpm install
```

### Launch the TUI

```bash
pnpm dev:tui
```

Type `/config` to pick your LLM provider and enter an API key. That's it — you're chatting.

### CLI one-liners

```bash
pnpm dev:cli -p "Summarize this project in one sentence"
pnpm dev:cli -j -p "What's 2^10?"                          # JSON output
pnpm dev:cli --export ./backup.json                         # Export all memories
```

### Daemon + API server

```bash
pnpm dev:server                    # http://127.0.0.1:3700
curl http://127.0.0.1:3700/health  # Health check

# REST chat
curl -X POST http://127.0.0.1:3700/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello!", "provider": "deepseek"}'

# SSE streaming
curl -N -X POST http://127.0.0.1:3700/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Write a haiku about code", "provider": "deepseek", "stream": true}'
```

### Work management

```bash
pnpm dev:cli work create --intent "Review today's PRs"
pnpm dev:cli work list
pnpm dev:cli work show <id>
pnpm dev:cli work audit <id>
```

---

## Architecture

```
┌──────────┐  ┌─────┐  ┌──────────┐  ┌──────────┐
│   TUI    │  │ CLI │  │  Web UI  │  │ Telegram │  ← thin channels
└────┬─────┘  └──┬──┘  └────┬─────┘  └────┬─────┘
     │           │          │             │
     └───────────┴──────────┴─────────────┘
                      │
              ┌───────┴───────┐
              │ @hachimi/core │  ← single brain
              │  HarnessRuntime│
              └───────┬───────┘
                      │
     ┌────────────────┼────────────────┐
     │                │                │
  Memory          Tools & MCP      Extensions
 (4-tier)        (builtin +       (hooks, skills,
                  custom)          capability sources)
```

**Key principle**: Channels are thin adapters. All intelligence lives in `@hachimi/core`. Add a new surface (Discord? Slack? Email?) by writing ~200 lines of adapter code.

---

## 📂 Project Structure

```text
hachimi/
├── apps/
│   ├── tui/              # Terminal UI (Ink + React)
│   └── server/           # Daemon (Fastify REST/SSE/WS)
├── packages/
│   ├── core/             # HarnessRuntime — the brain
│   ├── config/           # Provider presets & config
│   ├── storage/          # SQLiteStore + FileStore
│   ├── shared/           # i18n, utils, types, errors
│   └── channels/         # CLI, API, Web, Telegram adapters
├── examples/             # Usage examples (custom tools, Telegram bot, memory)
├── docs/                 # Architecture, design system, roadmap
└── package.json
```

---

## 🏁 Status

All planned phases (A–W) are **complete**. 38 test files, 107 unit tests — `pnpm test` all green.

| Phase | What | Status |
|-------|------|--------|
| A | Foundation, 4-tier memory, TUI | ✅ |
| B | Permissions, prompt-cache, vector retrieval v2 | ✅ |
| C | Multi-provider, daemon, auth, mid-turn steering, sandbox | ✅ |
| D | Portable memory, SHA-256 checksum, export/import | ✅ |
| E | CapabilitySource, skills, hooks, MCP client | ✅ |
| F | Telegram bot, Web UI, unified runtime | ✅ |
| W0–W3 | Work model, event persistence, permission policies | ✅ |

---

## 🤝 Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) first, then:

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test   # Make sure everything passes
```

New to the codebase? Start with [DEVELOPMENT.md](./docs/DEVELOPMENT.md).

---

## 📜 License

[Apache-2.0](./LICENSE)
