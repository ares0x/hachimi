# Personal Context Architecture (SOUL + TELOS + Second Brain)

Hachimi implements a three-tier personal context architecture designed for high prompt-cache stability, strict PathJail isolation, and human-aligned autonomy.

---

## Three-Tier Context Division

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tier 1 — SOUL (~/.hachimi/SOUL.md)                                           │
│   Tone, user preferences, behavioral guardrails (~500 chars).               │
│   Inserted into static system prompt prefix.                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tier 2 — TELOS (~/.hachimi/telos/{MISSION,GOALS,PROJECTS}.md)              │
│   User's personal mission, goals, and active projects (~3000 chars max).    │
│   Inserted into static system prompt prefix before tools & skills.          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tier 3 — Second Brain / Obsidian Vault (knowledgeRoot)                     │
│   Deep notes and reference materials.                                       │
│   Read on-demand via search/read tools — NEVER fills the prompt prefix!     │
│   Draft writes strictly isolated to knowledgeRoot/_inbox.                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration & PathJail Multi-Root Isolation

| Configuration Parameter | Default Value | Description |
| :--- | :--- | :--- |
| `soulPath` | `~/.hachimi/SOUL.md` | Path to personal SOUL file |
| `telosRoot` | `~/.hachimi/telos/` | Folder containing `MISSION.md`, `GOALS.md`, `PROJECTS.md` |
| `knowledgeRoot` | User configured | Read-only Obsidian Vault / Second Brain root |
| `knowledgeWriteRoot` | `knowledgeRoot/_inbox` | Write-allowed folder inside Second Brain |

### PathJail Rules
1. **`workspaceRoot`**: Full read-write access for active coding project.
2. **`knowledgeRoot`**: Read-only access for Second Brain vault notes.
3. **`knowledgeWriteRoot`**: Write access strictly restricted to `_inbox` folder. Attempts to write to other vault notes are blocked with `[沙箱拦截: 知识库只读保护]`.
