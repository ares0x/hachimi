# `@hachimi/core` Public API Freeze Specification (H1.2)

This document describes all public API surfaces exported by `@hachimi/core`, serving as the standardized contract between the core package and channel adapters (CLI, Web API Daemon, Telegram Bot, TUI, etc.).

**Hard rule**: External channels or apps **must not use deep imports** into internal source files (e.g., `import { Agent } from "@hachimi/core/src/agent/agent.js"`). Only `@hachimi/core` top-level exports are allowed.

---

## Core API Surface

### 1. HarnessRuntime Orchestrator
- **`HarnessRuntime`** — Unified cross-channel agent runtime controller.
  - `execute(input: RuntimeInput): Promise<RuntimeOutput>`
  - `steer(prompt: string): boolean`
  - `followUp(prompt: string): void`
  - `getStatus(): AppStatus`
  - `exportBundle(options?): Promise<HachimiBundleV1>`
  - `importBundle(source, options?): Promise<ImportBundleResult>`
- **`createHarnessRuntime(options?)`** — Factory for new `HarnessRuntime` instances.
- **`getOrCreateHarnessRuntime(options?)`** — Singleton/factory for the globally shared `HarnessRuntime`.

### 2. Sub-Agent Dispatch & Self-Evolution
- **`SubAgentDelegator`** — Minimal sub-agent isolation dispatcher with `async: true` background dispatch and `check_subagent_status` retrieval.
- **`TrajectoryCompressor`** — Interaction trajectory compressor, distilling tool chains and user correction patterns.
- **`SkillProposalManager`** — Human-in-the-Loop skill draft manager. Skills only take effect after explicit Accept in TUI/Web/REST.
- **`ProactiveScheduler`** — Cron expression and interval-based proactive reminder scheduler.

### 3. Composition Root & Session SDK
- **`createAppContext(options?)`** — Low-level Composition Root, initializing config, SQLite storage, memory, tools, skills, hooks, and agent.
- **`createAgentSession(options?)`** — High-level SDK returning an `AgentSession` bound to a specific `sessionId`.

### 4. Core Agent Loop
- **`Agent`** — Agent main loop controller with mid-turn steering and tool calling.
- **`createLLMFromConfig(config)`** — LLM Provider factory.
- **`ProviderRegistry`** — Multi-vendor preset LLM transport registry.
- **`MockLLMProvider`** / **`OpenAICompatibleProvider`** / **`AnthropicProviderTransport`** — Base LLM transports.

### 5. Extensions & Hooks
- **`HookRegistry`** — Lifecycle hook registry (`onSessionStart`, `onPreToolCall`, `onPostToolCall`).
- **`McpClientManager`** — MCP (Model Context Protocol) stdio client manager.
- **`SkillPackageLoader`** — External `~/.hachimi/skills/` skill package scanner and loader.

### 6. Memory & Portable Memory
- **`MemoryManager`** — Four-tier hybrid storage and vector retrieval memory manager.
- **`exportBundle` / `importBundle` / `migrateBundleToLatest`** — Portable memory export, additive merge import, and schema auto-migration.

### 7. Tools & Sandbox
- **`ToolRegistry`** — Tool registry with circuit breaker.
- **`ToolSandbox`** — 30s unified timeout, 1MB buffer cap, and sensitive env var scrubbing.
- **`PathJail`** — Workspace path escape prevention.

### 8. Data Contracts & Types
- **`RuntimeInput`** / **`RuntimeOutput`** / **`ChannelType`** / **`Message`** / **`Session`** / **`SubAgentTaskState`** / **`SkillDraft`** / **`TriggerTask`** etc.

---

## Import Rules

```typescript
// ✅ Allowed
import { HarnessRuntime, getOrCreateHarnessRuntime } from "@hachimi/core";

// ❌ Forbidden
import { Agent } from "@hachimi/core/src/agent/agent.js";
```

All public types are re-exported from the package root. Internal implementation details are encapsulated and may change without notice.
