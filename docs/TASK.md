# Hachimi Active Task Backlog (TASK.md)

> **当前阶段**: Phase F — 多终端 Client 与 Tier 2 技能自演化 (Multi-Surface Clients & Tier 2 Personalization)
> **关联文档**: [`PROJECT.md`](./PROJECT.md) | [`ROADMAP.md`](./ROADMAP.md) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`archive/PHASE_E_TASK.md`](./archive/PHASE_E_TASK.md)

---

## 📌 Phase F 任务清单与状态 (Multi-Surface & Personalization Tier 2)

### 1. F1 — Desktop 客户端接入 (Desktop Client over Daemon API)
- [ ] **F1.1**: 基于 Electron 或 Tauri 接入 Phase C 的守护进程 (`apps/server`) API，作为轻量客户端运行（而非重复嵌入核心）。
- 👥 **用户角度验收**: 用户在桌面双击启动应用，自动连接后台托管的 Hachimi 守护进程并渲染富文本/图形界面。

### 2. F2 — Telegram 消息通道桥接 (Telegram Messenger Client)
- [ ] **F2.1**: 基于 `grammy` 或 `telegraf` 实现 Telegram Bot 通道客户端，连接 Daemon API。
- 👥 **用户角度验收**: 用户在手机 Telegram 给 Bot 发消息，后台 Daemon 统一处理并返回答案，共享全量记忆与上下文。

### 3. F3 — Web 极简客户端 (Web Surface Client)
- [ ] **F3.1**: 提供开箱即用的 Web 聊天界面，支持 SSE 打字机渲染与 WebSocket 交互。
- 👥 **用户角度验收**: 用户打开浏览器访问 `http://localhost:3700` 即可直接在 Web 界面与 Agent 对话。

### 4. F4 — 极简子 Agent 派发 (Minimal Sub-Agent Delegation)
- [ ] **F4.1**: 明确并限定收窄的主从 Sub-Agent 派发机制，支持将特定子任务隔离给独立上下文子进程执行。
- 👥 **用户角度验收**: 用户在处理长篇任务时，Agent 可自动派发后台子任务，不阻塞主对话流。

### 5. F5 — 经验技能提取与自演化 (Skill-from-Experience Extraction)
- [ ] **F5.1**: 基于 Phase E3 的 `afterTurn` / `postToolCall` Hook 机制，分析对话历史模式并自动提议生成新技能模板。
- 👥 **用户角度验收**: 当用户频繁执行某一类复杂多步骤操作后，Agent 会主动向用户提议：“检测到您经常执行 X 操作，是否保存为新技能？”

### 6. F6 — Cron / 事件驱动主动触发器 (Proactive Triggers)
- [ ] **F6.1**: 引入基于 Cron 定时计划与事件驱动的主动提醒机制。
- 👥 **用户角度验收**: 用户可以要求 Agent：“每天早上 9 点帮我生成今日工作要点提醒”，Agent 会定时主动推送消息。

---

## 📜 历史阶段已完成任务归档 (Completed Archives)

- [x] **Phase A**: 基础架构、四层记忆、Tool/Skill 注册表与 TUI 通道 → 见 [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)
- [x] **Phase B**: 统一权限、Prompt-Cache ContextBuilder、向量检索 v2、显式技能激活 → 见 [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)
- [x] **Phase C**: Multi-Provider 传输层、CLI 嵌入模式、Daemon 守护进程 (`apps/server`)、C5 Auth、C6 Steer、C7 沙箱 → 见 [`archive/PHASE_C_TASK.md`](./archive/PHASE_C_TASK.md)
- [x] **Phase D**: 带 Schema 版本的可移植记忆、Checksum SHA256 校验、一键导出/导入、增量合并去重与自动 Schema 迁移 → 见 [`archive/PHASE_D_TASK.md`](./archive/PHASE_D_TASK.md)
- [x] **Phase E**: 统一能力源 `CapabilitySource`、`~/.hachimi/skills/` 外部技能包、声明式 Hooks、MCP Client → 见 [`archive/PHASE_E_TASK.md`](./archive/PHASE_E_TASK.md)

---

## 📂 相关文档归档与关联

- [`PROJECT.md`](./PROJECT.md) — **项目 PRD 文档**
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — **系统架构设计说明书**
- [`ROADMAP.md`](./ROADMAP.md) — **项目阶段路线图**
- [`archive/PHASE_C_TASK.md`](./archive/PHASE_C_TASK.md) — **Phase C 已完成任务归档**
- [`archive/PHASE_D_TASK.md`](./archive/PHASE_D_TASK.md) — **Phase D 已完成任务归档**
- [`archive/PHASE_E_TASK.md`](./archive/PHASE_E_TASK.md) — **Phase E 已完成任务归档**
