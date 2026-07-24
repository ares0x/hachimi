# Hachimi Active Task Backlog (TASK.md)

> **当前阶段**: Phase E — 统一扩展注册表、技能包与 MCP 接入 (Unified Extension Registry & MCP Client)
> **关联文档**: [`PROJECT.md`](./PROJECT.md) | [`ROADMAP.md`](./ROADMAP.md) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`archive/PHASE_D_TASK.md`](./archive/PHASE_D_TASK.md)

---

## 📌 Phase E 任务清单与状态 (Unified Extension Registry)

### 1. E1 — 统一扩展能力源抽象 (`CapabilitySource<T>`) (Done)
- [x] **E1.1**: 抽离统一的 `CapabilitySource<T>` 泛型接口 (`list()`, `resolve()`, `getPermission()`)，重构 `ToolRegistry` 与 `SkillRegistry` 使其归一化。
- [x] **E1.2**: 为所有的本地工具、动态技能与第三方能力提供一致的发现与权限查询机制。
- 👥 **用户角度验收**: 用户可在 TUI (`/status`)、CLI 或 REST API (`GET /api/status`) 中以统一的列表格式查看当前已激活的所有工具、技能与能力源。

### 2. E2 — 可安装扩展技能包 (`Installable Skill Packages`) (Done)
- [x] **E2.1**: 支持从用户目录 (`~/.hachimi/skills/`) 或 Git/npm 包中自动扫描并加载第三方 Lazy Skill 技能包。
- [x] **E2.2**: 识别标准 `SKILL.md` 清单与 TypeScript 内容，实现自动发现与热重载。
- 👥 **用户角度验收**: 用户只需将包含 `SKILL.md` 的技能文件夹放入 `~/.hachimi/skills/my-skill`，无需修改任何源代码，Agent 启动后即可自动感知并激活新技能。

### 3. E3 — 声明式生命周期钩子系统 (`Lifecycle Hooks System`) (Done)
- [x] **E3.1**: 实现 `preToolCall` (工具执行前), `postToolCall` (工具执行后), `sessionStart` (会话开始) 生命周期 Hook 机制。
- [x] **E3.2**: 支持 Hook 拦截工具参数、修改输出结果、记录操作日志与执行安全安全拦截。
- 👥 **用户角度验收**: 用户可以通过配置自定义 Hook 插件（如：在每次命令行工具执行前打印控制台审计日志，或拦截包含敏感关键词的入参）。

### 4. E4 — MCP (Model Context Protocol) 客户端集成 (Done)
- [x] **E4.1**: 实现 MCP 协议标准 Stdio Client，将其作为 `CapabilitySource<ToolDefinition>` 能力源无缝接入。
- [x] **E4.2**: 在 `config.json` 中增加 `mcpServers` 配置，Agent 启动时自动启动 MCP 子进程并拉取外部 Server 暴露的 Tool 定义。
- 👥 **用户角度验收**: 用户只需在 `config.json` 中配置标准的 MCP 服务（如官方的 `@modelcontextprotocol/server-fetch`），Hachimi 就能直接获得网页抓取等 MCP 扩展工具能力。

---

## 📜 历史阶段已完成任务归档 (Completed Archive)

- [x] **Phase A**: 基础架构、四层记忆、Tool/Skill 注册表与 TUI 通道 → 见 [`PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)
- [x] **Phase B**: 统一权限、Prompt-Cache ContextBuilder、向量检索 v2、显式技能激活 → 见 [`PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)
- [x] **Phase C**: Multi-Provider 传输层、CLI 嵌入模式、Daemon 守护进程 (`apps/server`)、C5 Auth、C6 Steer、C7 沙箱 → 见  [`PHASE_C_TASK.md`](./archive/PHASE_C_TASK.md)
- [x] **Phase D**: 带 Schema 版本的可移植记忆、Checksum SHA256 校验、一键导出/导入、增量合并去重与自动 Schema 迁移 → 见 [`PHASE_D_TASK.md`](./archive/PHASE_D_TASK.md)

---

## 📂 相关文档归档与关联

- [`PROJECT.md`](./PROJECT.md) — **项目 PRD 文档**
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — **系统架构设计说明书**
- [`ROADMAP.md`](./ROADMAP.md) — **项目阶段路线图**
- [`archive/PHASE_D_TASK.md`](./archive/PHASE_D_TASK.md) — **Phase D 已完成任务归档**
