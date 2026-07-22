# Hachimi Architecture

## High-level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Channels Layer                            │
│  CLI  ·  Desktop  ·  REST/WS API  ·  Telegram  ·  WeChat  · Slack │
└────────────────────────────┬────────────────────────────────────┘
                             │  Unified Message Protocol
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Core Harness                             │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │   Agent     │  │   Context    │  │      Skills (Lazy)      │ │
│  │   Loop      │◄─┤   Builder    │◄─┤                         │ │
│  └──────┬──────┘  └──────────────┘  └─────────────────────────┘ │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │   Tools     │  │ Permissions  │  │         Hooks           │ │
│  │  Registry   │◄─┤   Engine     │  │                         │ │
│  └──────┬──────┘  └──────────────┘  └─────────────────────────┘ │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Hierarchical Memory                       │ │
│  │  Working  →  Session  →  Long-term  →  Archival             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐                                                │
│  │   Session   │                                                │
│  │  Manager    │                                                │
│  └─────────────┘                                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Storage Layer                              │
│          SQLite  ·  Vector Store  ·  File System                 │
└─────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Core is Channel-Agnostic
The `@hachimi/core` package has **zero knowledge** of CLI, Telegram, or HTTP.
All channels convert their native messages into a unified `IncomingMessage` and receive `OutgoingMessage`.

### 2. Hierarchical Memory (Claude-inspired)
| Layer       | Lifetime          | Purpose                              | Typical Storage     |
|-------------|-------------------|--------------------------------------|---------------------|
| Working     | Current turn      | Immediate conversation context       | In-memory           |
| Session     | Single session    | Summaries, key decisions, todos      | SQLite              |
| Long-term   | Permanent         | User preferences, habits, facts      | SQLite + Vector     |
| Archival    | Permanent         | Documents, notes, generated artifacts| File + Vector       |

This is the foundation of “越来越懂我”.

### 3. Lazy Skills (Pi-inspired)
- System prompt only contains a short description of each skill.
- When the model decides to use a skill, the full instructions + related tools are loaded on demand.
- Keeps the context window clean and focused.

### 4. Clear Module Boundaries (Grok Build-inspired)
- **Agent**: pure reasoning + tool calling loop
- **Tools**: registration + safe execution
- **Memory / Session / Context**: state management
- **Permissions**: policy decisions
- **Hooks**: extension points without modifying core
- **Channels**: pure adapters

### 5. Headless First
REST API and bots are first-class citizens.
Desktop and CLI are just different frontends on top of the same core.

## Key Interfaces (Initial)

See `packages/core/src/types/index.ts` for the current type definitions.

The most important contracts:

- `IncomingMessage` / `OutgoingMessage` — channel protocol
- `ToolDefinition` — how tools are registered and executed
- `SkillDefinition` — lazy skill contract
- `MemoryAccess` — how the agent reads/writes memory
- `PermissionLevel` — safety classification of tools

## Implementation Order

We follow a strict bottom-up approach:

1. Types & project skeleton          ← **we are here**
2. Basic Tool Registry + simple Agent loop
3. Hierarchical Memory (in-memory first, then SQLite)
4. Lazy Skills
5. Context Builder + Compaction
6. Session Manager
7. Permission Engine
8. First real channel (CLI)
9. REST API
10. Builtin tools (writing, image…)
11. Messaging channels
12. Desktop

Each step should leave the system in a runnable and testable state.
