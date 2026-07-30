# Hachimi Active Task Backlog (TASK.md)

> **当前阶段**: Phase H3 — Harness 工程化极效提升 (Harness Engineering Elevation)
> **关联文档**: [`VISION.md`](./VISION.md) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`ROADMAP.md`](./ROADMAP.md) | [`API.md`](./API.md)
> **前提**: Phase W0-W5.5 基础设施与 Harness 前置修补已全量闭环

---

## 🎯 阶段总览

| 阶段 | 名称 | 状态 | 核心目标 |
|------|------|------|----------|
| **W0** | 执行真相源与可恢复 | 🟢 已完成 | 事件流落盘、进程重启后续跑 |
| **W1** | Work 数据模型与 API | 🟢 已完成 | Work 成为一等公民，替代纯 Session 聊天 |
| **W2** | 策略引擎与生产默认 | 🟢 已完成 | 权限策略、API Secret、多表面生产可用；approve/deny 单测覆盖 |
| **W3** | Work-first UI 最小集 | 🟢 已完成 | UI 改语义，投影 Runtime 状态而非聊天列表；Desktop 对齐 Web |
| **W4** | 演化闭环 F5 | 🟢 已完成 | 轨迹→技能提案→人审 Confirmation→Skill 物理落盘与动态注册 |
| **W5** | 上下文治理与评测加固 | 🟢 已完成 | 长 Work 规则 Compaction、Evals 3大新场景、ARCHITECTURE.md 对齐 |
| **W5.5** | Harness 正确性前置修补 | 🟢 已完成 | 修复二进制检测内存峰值、通道注入表、双重判定契约与记忆硬编码修补 |
| **H3** | Harness 工程化极效提升 | 🟢 已完成 | 信号级级联打断、领域截断、单调递增 seq、工具属性扩充与遥测度量 |
| **W6** | 连接器（可选 P2） | ⚪ 搁置 | 日历等工具化，非壳内 App |

---

## Phase H3 — Harness 工程化极效提升 Backlog

> **目标**: 对标 Claude Code, Pi, Maka-Agent 与 Grok-Build，建立工业级 Personal Agent Runtime 控制与防护体系。

### Tier 1 (P0) — 核心控制流与确定性上下文

#### H3.1 — AbortSignal 级联打穿与毫秒级强杀死 (AbortSignal Cascade & Subprocess SIGKILL)
- [x] `ToolExecContext` 深度打通 `signal?: AbortSignal`，在 `run_command` 工具中监听 `signal.onabort` 并级联触发 `child_process.kill("SIGKILL")`。
- [x] 当用户触发 `steer()` / `cancelWork` / HTTP `abort` 时，强行毫秒级中断正在运行的 shell 子进程与网络请求，释放宿主机资源。
- [x] **验收**: 跑一个 `sleep 30` 子进程，触发 abort 命令后，子进程在 50ms 内被 `SIGKILL` 终止，无残留后台僵尸进程；单测覆盖。

#### H3.2 — 结构化与领域感知输出压缩 (Structural & Domain-Aware Tool Truncation)
- [x] 升级 `ContextBuilder` 与 `tool_result` 截断逻辑，针对 `git diff`、文件目录树（`list_dir`）和编译堆栈日志实现结构化感知截断：
  - `git diff`: 保留变更 File Header 与 Hunk 差异行，折叠无变更行
  - `stack trace`: 保留 Error 头与首尾 3 行调用栈
  - `tree/list_dir`: 保留顶级与第一层目录，摘要深层文件
- [x] **验收**: 大 Diff / 深度目录树在 >8KB 时保留结构化 Context，不破坏语法结构；单测覆盖。

---

### Tier 2 (P1) — 事件确定性与工具属性扩充

#### H3.3 — 严格单调递增 Sequence ID 与事件无缝重放 (RuntimeEvent Monotonic `seq`)
- [x] `RuntimeEvent` 增加单调递增 `seq: number` 字段。
- [x] `FileEventStore` 与 `SQLiteEventStore` 在 `append` 时原子递增生成 `seq`，支持 API `/api/sessions/:id/events?sinceSeq=100`。
- [x] **验收**: 并发写入事件的 `seq` 严格单调递增；客户端通过 `sinceSeq` 可无缝增量重放；单测覆盖。

#### H3.4 — 工具属性扩充与副作用/幂等性策略 (Tool Metadata: `readOnly` & `isIdempotency`)
- [x] `ToolDefinition` 增加 `readOnly?: boolean` 与 `isIdempotent?: boolean` 字段。
- [x] 更新 `PermissionPolicy`：声明为 `readOnly: true` 的 safe 工具允许并行并发调度与乐观 UI 响应。
- [x] **验收**: 只读工具与写操作工具在策略表中有清晰的并发/乐观响应区分；单测覆盖。

---

### Tier 3 (P2) — 子 Agent 动态配额与遥测度量

#### H3.5 — 子 Agent 级联 Token 配额与事件流多路复用 (Sub-Agent Budget Cascading & Multiplexing)
- [x] 子 Agent 派生时继承父级动态预算配额（`maxTurns`, `maxTokens`, `maxCostUSD`），子 Agent 消耗实时从父级剩余总额扣减。
- [x] 子 Agent 产生的事件以 `parentWorkId.childEvent` 形式多路复用写入主事件总线并在 UI 中支持展开流式监控。
- [x] **验收**: 子 Agent 超预算自动熔断并归还控制权；UI 可流式观察子任务内部 Tool 执行。

#### H3.6 — 遥测度量与 PTY / `tmux` TUI E2E 自动化测试 Harness (Cost Telemetry & PTY E2E Suite)
- [x] 每一轮对话统计 `input_tokens` / `output_tokens` / `cache_hit` 并实时计算估算美金开销（$）。
- [x] 新增 `scripts/tui-e2e.sh` 测试脚本，通过 `tmux` / PTY 仿真终端自动化测试 TUI 渲染与按键响应。
- [x] **验收**: 日志与 Activity 输出包含实时 Token 美金估算；`pnpm test:tui` 脚本可在 CI 运行。

---

## Phase W6 — 连接器（可选 P2，已搁置）

> **目标**: 日历等为 Tool，挂在 Work 执行上，非壳内 App。

- [ ] **W6.1** — Connector 接口定义与 Keychain/AES 加密存储
- [ ] **W6.2** — 本机 ICS / Google Calendar 只读工具
- [ ] **W6.3** — Inspector 界面能力曝光与失败隔离

---

## 📜 历史阶段已完成任务归档 (W0 - W5.5)

- **Phase W0** — 执行真相源与可恢复 (`RuntimeEvent`, `FileEventStore`, SSE event stream)
- **Phase W1** — Work 数据模型与 API (`Work`, `WorkPlan`, `Activity` 投影, Works API, CLI `hachimi work`)
- **Phase W2** — 策略引擎与生产默认 (`PermissionPolicy`, `POST /api/tools/approve`, API Secret, CORS)
- **Phase W3** — Work-first UI 最小集 (`WorkList`, Goal/Plan/Activity 三层主区, PermissionDock, Inspector)
- **Phase W4** — 演化闭环 F5 (`TrajectoryCompressor`, `SkillProposalManager`, `~/.hachimi/proposals/`, Accept/Reject 人审)
- **Phase W5** — 上下文治理与评测加固 (`tool_result` 8KB 截断, >30 轮规则 Compaction, 9 大 Eval benchmark 用例)
- **Phase W5.5** — Harness 正确性前置修补 (二进制读取内存控制, Channel 映射表, 双重判定说明, `save_memory` 工具)
- **Phase A–I 历史归档** — 见 `archive/` 目录
