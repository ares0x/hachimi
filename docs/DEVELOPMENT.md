# Development Guide

How to work on Hachimi — monorepo structure, testing, debugging, and conventions.

## Monorepo Structure

Hachimi uses **pnpm workspaces** with this layout:

```text
hachimi/
├── apps/                    # Runnable applications
│   ├── tui/                 # Terminal UI (Ink + React)
│   └── server/              # Daemon server (Fastify)
├── packages/                # Shared libraries
│   ├── core/                # HarnessRuntime — unified engine
│   │   ├── src/runtime/     # Orchestrator
│   │   ├── src/agent/       # Agent loop
│   │   ├── src/extensions/  # CapabilitySource, Hooks, MCP
│   │   ├── src/portable/    # Portable memory
│   │   └── src/sandbox/     # Tool sandbox
│   ├── config/              # Provider presets & config
│   ├── storage/             # SQLiteStore, FileStore
│   ├── shared/              # i18n, utils, errors, types
│   └── channels/            # Channel adapters
│       ├── cli/             # Non-interactive CLI
│       ├── api/             # HTTP REST + SSE + WS
│       ├── web/             # Web UI
│       └── telegram/        # Telegram bot
├── docs/                    # Design docs & specs
├── scripts/                 # Utility scripts
└── package.json             # Workspace root
```

## Architecture Principles

### 1. Channels are thin

Channel adapters (CLI, Web, Telegram) should only:
1. Parse input
2. Call `runtime.execute()`
3. Render output

**Never put business logic in channels.** All agent logic, memory, tools belong in `@hachimi/core`.

### 2. Core is the brain

`@hachimi/core` (`packages/core/`) is the single source of truth. It owns:
- Agent orchestration
- Memory management
- Tool registry & execution
- Extension systems (hooks, skills, MCP)
- Portable memory

### 3. No deep imports

External consumers must only import from `@hachimi/core` top-level exports. Internal files like `packages/core/src/agent/agent.ts` are off-limits outside the package.

### 4. Tools are capabilities

Custom tools implement the `Tool` interface:
```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permission: "safe" | "needs_confirm" | "dangerous";
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}
```

Tools are registered via `CapabilitySource<T>` and can come from built-ins, skills, or MCP servers.

## Development Workflow

```bash
# Install (first time)
pnpm install

# TypeScript check
pnpm typecheck

# Lint
pnpm lint

# Auto-fix lint
pnpm lint:fix

# Format
pnpm format

# Run all tests
pnpm test

# Watch mode (TDD)
pnpm test:watch

# Smoke tests (no real API calls)
pnpm smoke:mock

# Full build
pnpm build
```

## Testing Strategy

- **Unit tests**: `vitest` in each package — test individual functions and classes
- **Smoke tests**: `tests/smoke/` — end-to-end with mock LLM, no real API calls
- **Eval tests**: `packages/evals/` — quality evaluation harness

### Running specific tests

```bash
# Single test file
pnpm test -- path/to/test.test.ts

# With coverage
pnpm test -- --coverage
```

## Adding a New Tool

1. Create a file in `packages/core/src/tools/builtin/` or use `CapabilitySource`
2. Implement the `Tool` interface
3. Register in the tool registry
4. Write tests

Example:
```typescript
// packages/core/src/tools/builtin/my-tool.ts
import type { Tool } from "../../types";

export const myTool: Tool = {
  name: "my_tool",
  description: "Does something useful",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string", description: "The input" }
    },
    required: ["input"]
  },
  permission: "safe",
  async execute(params) {
    return { content: `Got: ${params.input}` };
  }
};
```

## Adding a New Channel

1. Create a thin adapter in `packages/channels/`
2. Import `getOrCreateHarnessRuntime` from `@hachimi/core`
3. Parse input → `runtime.execute(input)` → render output
4. Handle `steer()` and `followUp()` for mid-turn control

## Debugging

### TUI Debug
The TUI logs to `~/.hachimi/logs/`. Set `DEBUG=hachimi:*` for verbose output.

### Server Debug
```bash
DEBUG=hachimi:* pnpm dev:server
```

### Memory Inspection
Use CLI commands to inspect state:
```bash
pnpm dev:cli work list
pnpm dev:cli work show <id>
pnpm dev:cli work audit <id>
```

## Code Style

We use [Biome](https://biomejs.dev/) for formatting and linting. Configuration is in `biome.json` at the root. CI will fail if linting doesn't pass.

## Feature setup notes

### Web Search Provider (optional)

`web_search` uses DuckDuckGo by default. For reliable search results, configure a
provider via `HACHIMI_SEARCH_PROVIDER` plus its API key:

- `HACHIMI_SEARCH_PROVIDER=tavily` + `TAVILY_API_KEY=...`
- `HACHIMI_SEARCH_PROVIDER=brave` + `BRAVE_API_KEY=...`
- `HACHIMI_SEARCH_PROVIDER=exa` + `EXA_API_KEY=...`
- `HACHIMI_SEARCH_PROVIDER=serper` + `SERPER_API_KEY=...`

When no key is configured, the tool falls back to DuckDuckGo and reports a clear
error if search is unavailable.

### DeepSeek Server-Side Web Search (Responses API)

DeepSeek's official API supports a **provider-executed** `web_search` tool via
the Responses API (`/responses`). Instead of the local `web_search` tool, the
model service runs the search and injects the results into the same response —
no search provider API key is needed.

To enable it in the Desktop app: **Settings → 模型提供商 → DeepSeek → 服务端联
网搜索（web_search）**. The connection then switches to the
`deepseek-responses` transport, the local `web_search` builtin is suppressed
for that connection (avoiding double searches), and the search step still
appears on the tool timeline via the normal `tool_call` / `tool_result` events.

You can also set it in `~/.hachimi/config.json`:

```json
{
  "llm": {
    "activeConnectionId": "deepseek",
    "connections": {
      "deepseek": {
        "id": "deepseek",
        "name": "DeepSeek",
        "providerType": "deepseek",
        "baseUrl": "https://api.deepseek.com",
        "defaultModelId": "deepseek-v4-flash",
        "serverWebSearch": true
      }
    }
  }
}
```

Notes:

- Enabling the flag routes the connection to `/responses` (the flag is designed
  for the official `https://api.deepseek.com` endpoint; custom relay/base URLs
  should keep it off).
- Other providers keep using the local `web_search` tool with
  `HACHIMI_SEARCH_PROVIDER` (see above).
- The connection test probes `/responses` when this flag is on, so a green
  result means the key and the search capability are both valid.

## PR Checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] New code has tests
- [ ] No deep imports from other packages
- [ ] PR description explains what and why

## Questions?

Open a [Discussion](https://github.com/hachimi-agent/hachimi/discussions) or check existing issues.
