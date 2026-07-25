# Hachimi Active Task Backlog (TASK.md)

> **当前阶段**: Phase H2 架构硬化与收口 (H2 Gap Closure) & Phase F4 SubAgent 硬化 (F4 SubAgent Hardening)
> **关联文档**: [`PROJECT.md`](./PROJECT.md) | [`ROADMAP.md`](./ROADMAP.md) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`API.md`](./API.md) | [`archive/PHASE_E_TASK.md`](./archive/PHASE_E_TASK.md)

---

## 📌 当前进行中任务与状态 (Active Tasks)

### 1. Phase H1 — 组装根与统一入口 (Done)
- [x] **H1.1**: TUI/CLI/Daemon Server 统一通过 `@hachimi/core` 组装，深路径 Import 归零。
- [x] **H1.2**: 建立 [`docs/API.md`](file:///Users/jace/workspace/Code/Node/Personal/hachimi/docs/API.md) 核心 API 面冻结规范与 `"exports"` 约束。
- [x] **H1.3**: `loadConfig()` / `getActiveProviderConfig()` 单一路线配置读取与旧字段清理。
- [x] **H1.4**: GitHub Actions 自动化 CI (`.github/workflows/ci.yml`) 与 `pnpm smoke:mock` 烟雾指令。
- [x] **H1.5**: HarnessRuntime 错误边界隔离 try-catch，单测与 Mock 异常防护。
- [x] **H1.6**: Daemon API `x-request-id` 链路追踪中间件与日志上下文穿透。

### 2. Phase H2 — 管道闭合、无 UI 策略与时间注入 (In Progress)
- [x] **H2.1**: ContextBuilder 契约测试，静态 Prefix 顺序锁死，超长仅在尾部截断。
- [x] **H2.2**: 统一工具 5 步执行管道，全量工具 30s 统一超时防卡死隔离。
- [x] **H2.3**: `safe`/`needs_confirm`/`dangerous` 权限三级贯穿对齐，矩阵单测覆盖 9 组组合。
- [x] **H2.4a/b**: 沙箱 30s 超时、1MB Buffer 截断与敏感环境变量脱敏 (`scrubEnv`)、`PathJail` 路径狱。
- [x] **H2.5**: 自我修正机制与 Circuit Breaker 工具 3 次连续失败熔断器。
- [x] **H2.6**: Lifecycle Hooks 全量接入 `Agent.run()` 与 `HarnessRuntime.execute()`。
- [x] **H2.7**: MCP 工具与本地工具共享统一管道， bad MCP 异常被捕获隔离。
- [x] **H2.8**: **无 UI 渠道默认审批策略** (`channelPolicy`: `deny` / `allow-safe` / `allowlist`) 闭合无 UI 端工具控制。
- [x] **H2.9**: **Context 动态区系统本地时间注入** 与内置 `get_current_datetime` 精确报时工具，解决时间查询诉求。

### 3. Phase F4 — 极简子 Agent 派发与安全硬化 (F4-harden In Progress)
- [x] **F4.1**: `SubAgentDelegator` 隔离派发器，支持 `async: true` 50ms 极速非阻塞派发与 `check_subagent_status` 查询。
- [x] **F4.2**: **防递归爆栈拦截**：子 Agent 会话中自动阻断 `delegate_subagent` 递归调用。
- [x] **F4.3**: **专职 Worker System Prompt**：为子任务注入独立 Worker 提示词，避免继承完整主助理人设。
- [x] **F4.4**: **资源预算限制**：限制子任务最大轮次 `maxToolRounds = 5`，防止无限消耗。

---

## 📅 后续排期 (Roadmap Ahead)

- [ ] **Phase F5**: 经验技能提取与人在回路 (Human-in-the-Loop) 提案机制（提案非事实，需用户 Confirm）。
- [ ] **Phase F6**: Cron / 事件驱动主动触发器与后台通知推送。
- [ ] **Phase H3**: 存储行为与可移植性硬化 (File/SQLite 行为切换测试、黄金数据包 Fixture、坏库降级)。
- [ ] **Phase H4**: 多表面生产可用性 (默认秘钥生成、CORS 白名单、Telegram 连通性)。

---

## 📜 历史阶段已完成任务归档 (Completed Archives)

- [x] **Phase A**: 基础架构、四层记忆、Tool/Skill 注册表与 TUI 通道 → 见 [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)
- [x] **Phase B**: 统一权限、Prompt-Cache ContextBuilder、向量检索 v2、显式技能激活 → 见 [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)
- [x] **Phase C**: Multi-Provider 传输层、CLI 嵌入模式、Daemon 守护进程 (`apps/server`)、C5 Auth、C6 Steer、C7 沙箱 → 见 [`archive/PHASE_C_TASK.md`](./archive/PHASE_C_TASK.md)
- [x] **Phase D**: 带 Schema 版本的可移植记忆、Checksum SHA256 校验、一键导出/导入、增量合并去重与自动 Schema 迁移 → 见 [`archive/PHASE_D_TASK.md`](./archive/PHASE_D_TASK.md)
- [x] **Phase E**: 统一能力源 `CapabilitySource`、`~/.hachimi/skills/` 外部技能包、声明式 Hooks、MCP Client → 见 [`archive/PHASE_E_TASK.md`](./archive/PHASE_E_TASK.md)
