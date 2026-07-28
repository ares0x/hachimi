# Hachimi Project PRD (Product Requirements Document)

> **Version**: 1.0.0
> **Status**: Active
> **Positioning**: Personal AI Assistant Harness Framework for TypeScript & Node.js

---

## 1. Product Overview

**Hachimi** is a local-first, multi-client, progressively self-evolving personal AI assistant harness framework for developers and power users. Built with TypeScript/Node.js, it combines modern terminal interaction (TUI), daemon services, and portable storage architecture.

The ultimate goal is to build an "intelligent brain that understands you better over time" — while ensuring 100% user data ownership and seamless multi-surface collaboration across desktop, CLI, and messaging platforms (e.g., Telegram).

---

## 2. Product Vision & Four Pillars

| Pillar | Name | Description & Constraints |
| :--- | :--- | :--- |
| **P1** | **Local-first, Migratable Memory** | All data stored locally by default. Decouples "runtime storage (file/SQLite)" from "portable migration package (versioned bundle)" for zero-loss cross-device migration and backup. |
| **P2** | **Dual-tier Personalization** | **Tier 1 (Foundation)**: Automatic memory deduplication, decay, context summarization, and embedding-based similarity retrieval.<br>**Tier 2 (Advanced)**: Hook-based autonomous skill proposal and evolution from conversation history. |
| **P3** | **Unified Deep Extensibility** | Tools, Skills, and MCP share the same abstract `CapabilitySource` registration and discovery mechanism. External MCP servers integrate as a tool source. |
| **P4** | **Multi-surface Collaboration** | When desktop, web, Telegram bot, and other clients run simultaneously, they share a single `apps/server` daemon and `@hachimi/core` instance, preventing memory and session state split-brain. |

---

## 3. Runtime Topology & System Architecture

Two equally important runtime modes:

1. **Embedded Mode**:
   - Process directly instantiates `@hachimi/core` internally.
   - No network overhead. Suitable for one-shot CLI scripts, embedded TUI, unit tests, or standalone scenarios.
2. **Daemon Mode**:
   - `apps/server` launches a long-running process hosting a single `@hachimi/core` instance.
   - Provides local HTTP/WebSocket API with transport-layer token auth and tool sandbox isolation.
   - Desktop, Web, and Telegram clients connect as thin clients to this process.

---

## 4. Key Functional Requirements

### 4.1 Agent Core Loop & Multi-Provider Transport
- **Multi-vendor & gateway compatibility**: Decoupled `ProviderTransport` interface with native support for OpenAI, Anthropic Claude, DeepSeek, Moonshot/Kimi, Qwen/DashScope, and third-party gateways (OneAPI/NewAPI).
- **Tool Loop**: Single and multi-turn tool invocation with user confirmation gating (`safe` / `needs_confirm` / `dangerous`).
- **Prompt-Cache Stability**: Strict separation of static prefixes (identity, tool/skill definitions) from dynamic content (retrieved memories, current conversation) to maximize LLM cache hit rate.

### 4.2 Hierarchical Memory System
- **Working Memory**: Temporary context within a single turn.
- **Session Memory**: Key decisions and summaries within a single session.
- **Long-term Memory**: User preferences, habits, and facts (embedding vector retrieval).
- **Archival Memory**: Long-form documents, notes, and generated artifacts.

### 4.3 Skills & Extension System
- **Lazy Skills**: System prompt carries only one-line skill descriptions; full instructions and tools loaded on activation.
- **Unified Registry (`CapabilitySource`)**: Unified interface and permission gating for tools, skills, and MCP servers.

### 4.4 TUI (Terminal UI)
- Alt Buffer (`\x1b[?1049h`) full-screen Canvas-based terminal interface.
- `/config` visual config wizard for provider/model switching.
- Slash command system for status, memory, session management.

### 4.5 Work & Event Model
- **Work**: Top-level work unit with goal, plan, sessions, and event log.
- **Event Persistence**: All tool calls, user interactions, and decisions recorded as structured events.
- **Recovery**: Automatic recovery from persisted events after crash/restart.

---

## 5. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | TUI rendering < 16ms/frame. API response < 200ms p50. |
| **Reliability** | Graceful degradation when LLM providers fail. Circuit breaker for tools. |
| **Security** | Bearer token auth for daemon. PathJail for filesystem tools. Tool sandbox isolation. |
| **Portability** | Bundle v1 with SHA-256 checksum. Cross-platform (macOS, Linux, Windows via WSL). |
| **Observability** | Structured logging. CLI audit trail. Work event timeline. |

---

## 6. Success Metrics

- TUI can complete a full provider config → chat → tool call loop without documentation
- Memory export/import round-trips without data loss
- Multi-client (TUI + Web + Telegram) share the same session state
- Test suite passes 100% on every commit

---

## 7. Related Documents

- [Architecture](./ARCHITECTURE.md)
- [Design System](./DESIGN_SYSTEM.md)
- [Roadmap](./ROADMAP.md)
- [API Reference](./API.md)
