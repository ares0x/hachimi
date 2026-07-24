# Hachimi Project PRD (Product Requirements Document)

> **版本号**: 1.0.0  
> **状态**: 活跃 (Active)  
> **定位**: 个人 AI 助理 Harness 框架 (Personal AI Assistant Harness for TypeScript & Node)

---

## 1. 产品概述 (Product Overview)

**Hachimi** 是一款面向开发者与高级用户的本地优先、多终端协同、具备渐进式自我演化能力的个人 AI 助理 Harness 框架。项目采用 TypeScript / Node.js 编写，结合了现代终端交互（TUI）、守护进程服务（Daemon）与可移植存储架构。

项目的终极目标是打造一个“**随着时间推移越用越懂用户**”的智能大脑，同时保证用户数据 100% 掌握在自己手中，且能在桌面、命令行、消息软件（如 Telegram）等多终端之间无缝协同。

---

## 2. 核心愿景与四大支柱 (Product Vision & Four Pillars)

| 支柱编号 | 支柱名称 | 详细说明与约束 |
| :--- | :--- | :--- |
| **P1** | **本地优先、可迁移的记忆 (Local-first, Migratable Memory)** | 默认所有数据存放在用户本地设备。将“运行时存储（文件/SQLite）”与“便携迁移包（Versioned Bundle）”解耦，支持跨设备零损耗迁移与备份。 |
| **P2** | **越用越懂你的双阶个性化 (Personalization)** | **Tier 1 (基础阶段)**：记忆的自动去重、衰减、上下文总结与向量（Embedding）相似度检索。<br>**Tier 2 (高级阶段)**：基于 Hook 机制从对话历史中自主提案并演化新技能。 |
| **P3** | **统一深度可扩展性 (Deep Extensibility)** | Tools、Skills、MCP 共享同一套抽象的 `CapabilitySource` 注册与发现机制，拒绝各自为政。外部 MCP 服务作为一种工具源接入。 |
| **P4** | **多终端协同 (Multi-surface)** | 桌面端、Web 端、Telegram 机器人等多个终端同时开启时，共享同一个 `apps/server` 守护进程与唯一的 `@hachimi/core` 实例，避免记忆与会话状态脑裂。 |

---

## 3. 运行拓扑与系统架构 (Runtime Topology)

系统支持两种同等重要的运行模式：

1. **嵌入模式 (Embedded Mode)**：
   - 进程直接在内部实例化 `@hachimi/core`。
   - 无网络开销，适用于单次 CLI 脚本、嵌入式 TUI、单元测试或独立运行场景。
2. **守护进程模式 (Daemon Mode)**：
   - 由 `apps/server` 启动长驻进程，托管唯一的 `@hachimi/core` 实例。
   - 提供本地 HTTP / WebSocket API，并附加传输层 Token 鉴权与工具沙箱隔离。
   - Desktop 客户端、Web 客户端、Telegram 机器人均作为轻客户端（Thin Clients）连接此进程。

---

## 4. 关键功能模块 (Key Functional Requirements)

### 4.1 Agent 核心循环与 Context 引擎
- **工具调用循环 (Tool Loop)**：支持单轮与多轮工具调用，支持拦截与用户确认门控 (`safe` / `needs_confirm` / `dangerous`)。
- **Prompt-Cache 稳定性**：严格分隔静态前缀（身份、工具/技能定义）与动态变动内容（检索记忆、当前对话），最大化利用 LLM 缓存。

### 4.2 层次化记忆系统 (Hierarchical Memory)
- **Working Memory**：当前 Turn 内部的临时上下文。
- **Session Memory**：单会话内部的关键决策与总结。
- **Long-term Memory**：用户偏好、习惯与事实记录（基于 Embedding 向量检索）。
- **Archival Memory**：长篇文档、笔记与生成产物。

### 4.3 技能与扩展系统 (Skills & Tools)
- **Lazy Skills**：系统 Prompt 仅携带单行技能描述，激活后按需加载完整指令与工具。
- **统一注册表 (`CapabilitySource`)**：统一工具、技能与 MCP Server 的接口与权限门控。

### 4.4 TUI 沉浸式终端 (Terminal UI)
- 基于终端 Alt Buffer (`\x1b[?1049h`) 独占全屏 Canvas 画布。
- 采用 GrokNight 官方高对比配色 (TokyoNight Accents)。
- 支持 Fish / Grok 风格的单行 Ghost Text 幽灵内联补全。
- 支持键盘方向键（`↑` / `↓`）交互式选择面板及工具执行时间线树状渲染。

---

## 5. 明确非目标 (Non-Goals & Boundaries)

- **不基于任何未授权的反编译源码**：严禁参考基于反编译 Claude Code 生成的代码，所有设计均来自于 Anthropic 官方论文与开源项目 (Pi, Grok-Build, Hermes-Agent)。
- **不做无边界的重型 Multi-Agent 框架**：仅保留狭义、明确的主从子 Agent 派发机制，不搞复杂的分布式 Multi-Agent 编排。
- **不强制绑定云端服务**：所有存储与大脑核心均能在纯本地无网环境下运行（需本地 LLM / Ollama 或 API Key）。

---

## 6. 相关文档关联 (Related Documents)

以下为 `docs/` 目录及项目根目录下的相关架构设计与任务文档：

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — **系统架构设计说明书**（包含运行拓扑、四支柱分析、技术债与模块边界）
- [`ROADMAP.md`](./ROADMAP.md) — **项目阶段路线图**（Phase A 至 Phase G 演进计划）
- [`TASK.md`](./TASK.md) — **活跃任务清单**（当前 Phase B 详细开发任务）
- [`README.md`](../README.md) — **项目快速开始与 README 概览**
