# Hachimi

**Hachimi** is a general-purpose personal AI assistant harness.

It is designed to become a long-term companion that understands you better over time.
Not limited to coding — it supports writing, image generation, knowledge management, and any custom capability through Skills.

### Key Features (Planned)

- **Multi-channel**: CLI · Desktop · REST API · Telegram · WeChat · Slack
- **Hierarchical Memory**: Working → Session → Long-term → Archival (inspired by Claude Code analysis)
- **Lazy Skills**: Extremely small system prompt, load full skill only when needed (inspired by Pi)
- **Clean modular architecture**: Core is completely channel-agnostic (inspired by Grok Build)
- **Strong permissions & tool safety**
- **Extensible**: Skills · Plugins/Hooks · MCP · Custom tools
- **Local-first**, with optional cloud sync later

### Design Philosophy

> LLM is stateless.
> The Harness is what makes it reliable, constrained, extensible, and increasingly personal.

We take the best ideas from:

| Project          | What we take                                      |
|------------------|---------------------------------------------------|
| **Pi**           | Minimal core + Lazy Skills design                 |
| **Claude Code**  | Hierarchical memory, permission gates, session management, context compaction |
| **Grok Build**   | Clear module separation (Runtime / Tools / State / Channels), Hooks, Headless-first |

### Project Structure

```text
Hachimi/
├── packages/
│   ├── core/                 ★ The pure harness (no UI knowledge)
│   │   ├── agent/            Agent loop, planning, sub-agents
│   │   ├── memory/           Hierarchical memory system
│   │   ├── context/          Context assembly & compaction
│   │   ├── skills/           Lazy Skills registry
│   │   ├── tools/            Tool registry + execution
│   │   ├── permissions/      Permission policy engine
│   │   ├── session/          Session lifecycle & persistence
│   │   ├── hooks/            Lifecycle hooks
│   │   └── types/            Shared core types
│   │
│   ├── channels/             All external interfaces
│   │   ├── cli/
│   │   ├── desktop/
│   │   ├── api/              REST + WebSocket
│   │   ├── telegram/
│   │   ├── wechat/
│   │   └── slack/
│   │
│   ├── tools-builtin/        Built-in capability tools
│   │   ├── writing/
│   │   ├── image/
│   │   ├── search/
│   │   ├── knowledge/
│   │   └── system/
│   │
│   ├── storage/              Storage backends
│   │   ├── sqlite/
│   │   ├── vector/
│   │   └── file/
│   │
│   └── shared/               Common utilities
│
├── apps/                     Runnable entry points
│   ├── cli/
│   ├── desktop/
│   └── server/               Starts API + bots together
│
├── skills/                   User & community skills (markdown + code)
├── config/                   Configuration files
└── docs/
```

### Development Roadmap (Priority Order)

1. **Foundation** (current)
   - Project structure & types
   - Core interfaces

2. **Core Agent Loop + Tools**
   - Basic agent loop
   - Tool registry & simple execution

3. **Hierarchical Memory**
   - Working / Session / Long-term layers
   - Basic persistence (SQLite)

4. **Lazy Skills System**

5. **Session Management + Context Compaction**

6. **Permissions & Safety**

7. **First Channel: CLI**

8. **REST API**

9. **Builtin tools** (writing, image generation…)

10. **Messaging channels** (Telegram first)

11. **Desktop app**

### Getting Started (after foundation is solid)

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Later...
npm run dev:cli
npm run dev:server
```

### License

MIT

---

This project is built for learning and personal use.
Architecture inspired by public analysis of Claude Code, the open-source Pi harness, and xAI's Grok Build.
