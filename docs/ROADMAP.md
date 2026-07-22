# Development Roadmap

We develop strictly according to priority.
Each phase should leave the project in a **runnable and testable** state.

## Phase 0 — Foundation (Current)
- [x] Monorepo structure
- [x] Core types
- [x] Architecture documentation
- [x] Basic package scaffolding

## Phase 1 — Minimal Agent Loop
**Goal**: Can receive a message and call a mock tool.

- [ ] Implement `ToolRegistry`
- [ ] Implement a very simple `Agent` loop (single turn + tool call)
- [ ] Mock LLM provider (for testing without real API key)
- [ ] Unit tests for the loop

## Phase 2 — Hierarchical Memory (In-memory)
**Goal**: Agent can remember within a session and across simple turns.

- [ ] `MemoryManager` with Working + Session layers
- [ ] Simple importance scoring
- [ ] Inject relevant memory into context

## Phase 3 — Persistence
- [ ] SQLite storage backend
- [ ] Session save / resume
- [ ] Long-term memory storage

## Phase 4 — Lazy Skills
- [ ] `SkillRegistry`
- [ ] Skill activation on demand
- [ ] Example skills (e.g. “writing”, “summarize”)

## Phase 5 — Context Management
- [ ] Context builder
- [ ] Compaction / summarization when context grows too large

## Phase 6 — Permissions
- [ ] Permission levels
- [ ] Approval flow (for dangerous tools)

## Phase 7 — First Real Channel: CLI
- [ ] Interactive CLI using the core
- [ ] Streaming responses (nice to have)

## Phase 8 — REST API
- [ ] HTTP + WebSocket endpoints
- [ ] Authentication (simple token for now)
- [ ] Session management via API

## Phase 9 — Builtin Tools
- [ ] Writing tools
- [ ] Image generation (call external API)
- [ ] Web search
- [ ] Knowledge base tools

## Phase 10 — Messaging Channels
- [ ] Telegram bot
- [ ] Slack
- [ ] WeChat (via bridge)

## Phase 11 — Desktop
- [ ] Electron or Tauri shell
- [ ] Local UI that talks to the same core / API

---

After each phase we will pause, review the design, and only then move forward.
