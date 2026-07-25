# Hachimi Active Task Backlog (TASK.md)

> **当前阶段**: Phase F — 多终端 Client 与 Tier 2 技能自演化 (Multi-Surface Clients & Tier 2 Personalization)
> **关联文档**: [`PROJECT.md`](./PROJECT.md) | [`ROADMAP.md`](./ROADMAP.md) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`API.md`](./API.md) | [`archive/PHASE_E_TASK.md`](./archive/PHASE_E_TASK.md)

---

## 📌 Phase F 任务清单与状态 (Multi-Surface & Personalization Tier 2)

### 1. F1 — Desktop 客户端接入 (Desktop Client over Daemon API) (暂缓)
- [ ] **F1.1**: 基于 Electron 或 Tauri 接入 Phase C 的守护进程 (`apps/server`) API，作为轻量客户端运行（暂时延期）。

### 2. F2 — Telegram 消息通道桥接 (Telegram Messenger Client) (Done)
- [x] **F2.1**: 基于 `grammy` 实现 Telegram Bot 网关 (`packages/channels/telegram`)，支持用户白名单隔离、`config.json` 持久化与首次交互引导。

### 3. F3 — Web 极简客户端 (Web Surface Client) (Done)
- [x] **F3.1**: 基于 `packages/channels/web` 与 Fastify 静态托管，在 `http://127.0.0.1:3700/` 提供黑金玻璃拟态 Web 界面，支持 SSE 打字机、状态统计与 Portable Bundle 导入/导出。

### 4. F4 — 极简子 Agent 派发 (Minimal Sub-Agent Delegation)
- [ ] **F4.1**: 明确并限定收窄的主从 Sub-Agent 派发机制，支持将特定子任务隔离给独立上下文子进程执行。

### 5. F5 — 经验技能提取与自演化 (Skill-from-Experience Extraction)
- [ ] **F5.1**: 基于 Phase E3 的 `afterTurn` / `postToolCall` Hook 机制，分析对话历史模式并自动提议生成新技能模板。

### 6. F6 — Cron / 事件驱动主动触发器 (Proactive Triggers)
- [ ] **F6.1**: 引入基于 Cron 定时计划与事件驱动的主动提醒机制。

---

## 🛡️ Phase H — Harness 架构硬化与工程化全量验收 (Done)

- [x] **H1.1**: TUI/CLI/Daemon Server 统一通过 `@hachimi/core` 组装，深路径 Import 归零。
- [x] **H1.2**: 建立 [`docs/API.md`](file:///Users/jace/workspace/Code/Node/Personal/hachimi/docs/API.md) 核心 API 面冻结规范与 `"exports"` 约束。
- [x] **H1.3**: `loadConfig()` / `getActiveProviderConfig()` 单一路线配置读取与旧字段清理。
- [x] **H1.4**: GitHub Actions 自动化 CI (`.github/workflows/ci.yml`) 与 `pnpm smoke:mock` 烟雾指令。
- [x] **H1.5**: HarnessRuntime 错误边界隔离 try-catch，单测与 Mock 异常防护。
- [x] **H1.6**: Daemon API `x-request-id` 链路追踪中间件与日志上下文穿透。
- [x] **H2.1**: ContextBuilder 契约测试，静态 Prefix 顺序锁死，超长仅在尾部截断。
- [x] **H2.2**: 统一工具 5 步执行管道，全量工具 30s 统一超时防卡死隔离。
- [x] **H2.3**: `safe`/`needs_confirm`/`dangerous` 权限三级贯穿对齐，矩阵单测覆盖 9 组组合。
- [x] **H2.4a/b**: 沙箱 30s 超时与 1MB Buffer 截断明确化（MVP 范围明确声明）。
- [x] **H2.5**: 自我修正机制（JSON 失败回流 1 次）与 Circuit Breaker 工具 3 次连续失败熔断器。
- [x] **H2.6**: Lifecycle Hooks 全量接入 `Agent.run()` 与 `HarnessRuntime.execute()`，集成计数单测。
- [x] **H2.7**: MCP 工具与本地工具共享统一管道， bad MCP 异常被捕获隔离。

---

## 📜 历史阶段已完成任务归档 (Completed Archives)

- [x] **Phase A**: 基础架构、四层记忆、Tool/Skill 注册表与 TUI 通道 → 见 [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)
- [x] **Phase B**: 统一权限、Prompt-Cache ContextBuilder、向量检索 v2、显式技能激活 → 见 [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)
- [x] **Phase C**: Multi-Provider 传输层、CLI 嵌入模式、Daemon 守护进程 (`apps/server`)、C5 Auth、C6 Steer、C7 沙箱 → 见 [`archive/PHASE_C_TASK.md`](./archive/PHASE_C_TASK.md)
- [x] **Phase D**: 带 Schema 版本的可移植记忆、Checksum SHA256 校验、一键导出/导入、增量合并去重与自动 Schema 迁移 → 见 [`archive/PHASE_D_TASK.md`](./archive/PHASE_D_TASK.md)
- [x] **Phase E**: 统一能力源 `CapabilitySource`、`~/.hachimi/skills/` 外部技能包、声明式 Hooks、MCP Client → 见 [`archive/PHASE_E_TASK.md`](./archive/PHASE_E_TASK.md)
- [x] **Phase H**: Harness 核心架构硬化、API 面冻结、CI 自动化流水线、统一管道与 Circuit Breaker 熔断器。
