# Hachimi Active Task Backlog (TASK.md)

> **当前阶段**: Phase H7 & Phase PC 均已完美落实与闭环
> **关联文档**: [`VISION.md`](./VISION.md) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`ROADMAP.md`](./ROADMAP.md) | [`API.md`](./API.md) | [`PERSONAL_CONTEXT.md`](./PERSONAL_CONTEXT.md)
> **前提**: Monorepo 100% 单元测试与烟雾测试 Pass

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
| **H4** | 本地词法/n-gram 相似度记忆与 RAG 索引 | 🟢 已完成 | 本地词法/n-gram 余弦相似度检索、RAG 记忆清洗与动态 Context 装配 |
| **H5** | Shell AST 预审与命令安全防护 | 🟢 已完成 | Shell AST 语法分析器、高危命令/管道/逃逸路径安全预审器 |
| **V1** | Vision 落地（近端心智与安全） | 🟢 已完成 | `uiKind` / `workspaceRoot` 扩展、动态 PathJail 项目隔离、打开项目入口 |
| **Next.2** | 技能轨迹自主进化与人审 | 🟢 已完成 | `TrajectoryCompressor` + 提炼按键 + 人审确认卡片与热装载 |
| **Next.3** | 多模态与 HTML 沙箱 Live Preview | 🟢 已完成 | Mermaid 架构流程图渲染 + HTML Live Preview 响应式 Modal 沙箱 |
| **H7** | Vision 对齐与多命名根 PathJail | 🟢 已完成 | 泛化 PathJail 支持多命名根 (`workspaceRoot`/`knowledgeRoot`/`knowledgeWriteRoot`)、AES 加密存储 |
| **PC** | Personal Context (SOUL + TELOS + Second Brain) | 🟢 已完成 | `SOUL.md` + `TELOS` 稳定前缀、`PersonalContextLoader`、Second Brain 挂载与 PathJail 隔离 |
| **H6** | 多 Worker 并发 DAG 与结果汇流 | 🟢 已完成 | 树状 Work DAG 状态机 (`parentWorkId`)、`SubAgentDelegator.runParallelSubAgents` 并发派生与结果 Join 汇流 |
| **W6** | 连接器 (Connectors) | 🟢 已完成 | `IConnector` 接口定义、AES-256-GCM 存储、`ICSConnector` 本机日历工具 |

---

## 优先级 1: Phase H7 — Vision 对齐与多命名根 PathJail 安全泛化 (Done)

- [x] **H7.1 Work 元数据 uiKind 校验加固**: `uiKind: "conversation" | "task" | "project"` 校验与自动推导逻辑加固。
- [x] **H7.2 PathJail/ToolSandbox 泛化支持多个命名根**:
  - `workspaceRoot`: 读写权限（代码工作区）
  - `knowledgeRoot`: 只读权限（Second Brain / Obsidian vault）
  - `knowledgeWriteRoot`: 只写特定子目录（默认 `knowledgeRoot/_inbox`）
  - **验收**: 三种根同时存在时，各自越权写操作都被正确拦截（`[沙箱拦截: 知识库只读保护]`）；单测覆盖 `packages/core/src/context/personal-context.test.ts`。
- [x] **H7.3 API Key 静态 AES-256-GCM 加密存储**: 明文 API Key / Secret 加密存储于本地配置文件。
- [x] **H7.4 威胁模型与架构文档更新**: `docs/PERSONAL_CONTEXT.md` 中说明三层分工与 PathJail 多根防护机制。

---

## 优先级 2: Phase PC — Personal Context: SOUL + TELOS + Second Brain 原生融合 (Done)

- [x] **PC0 约定与文档**: 编写 `docs/PERSONAL_CONTEXT.md`，定义配置类型 `soulPath`/`telosRoot`/`knowledgeRoot`。
- [x] **PC1 TELOS + SOUL 加载器**:
  - 编写 `PersonalContextLoader`: 读取 `SOUL.md` 与 TELOS 3 文件，按字符上限截断，按 mtime 缓存。
  - 在 `ContextBuilder` 固定槽位插入: `identity -> SOUL + TELOS -> skillsBlock -> toolsBlock`（锁死 Prefix 保持 Prompt-Cache 命中率）。
- [x] **PC2 Second Brain 挂载**: 走 H7.2 多命名根校验，只读读取 `knowledgeRoot`，草稿只写 `knowledgeRoot/_inbox`。

---

## 优先级 3: Phase H6 — 多 Worker 并发 DAG 与结果汇流 (Done)

- [x] **H6.1 树状 Work DAG 状态机**: Work 数据结构支持 `parentWorkId` 关联的子 Work 树状 DAG 状态管理。
- [x] **H6.2 多 Worker 并发派生与结果 Join 汇流**: `SubAgentDelegator` 支持 `runParallelSubAgents([tasks])` 并发派生多个 Worker 并 Join 汇总结果。

---

## 优先级 4: Phase W6 — 本地连接器 (Connectors) (Done)

- [x] **W6.1 Connector 接口与 AES 加密存储**: 定义 `IConnector` 接口与 `encryptSecret` / `decryptSecret` 工具。
- [x] **W6.2 本机 ICS / 系统日历只读工具**: `ICSConnector` 提供 `calendar_list_events` 工具。
