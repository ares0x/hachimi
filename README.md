# Hachimi (哈基米)

面向 TypeScript & Node.js 的**本地优先、多终端协同、具备渐进式自我演化能力的个人 AI 助理 Harness 框架**。

配合教程：[build-personal-ai-assistant](https://github.com/ares0x/build-personal-ai-assistant)
在线阅读：[https://ares0x.github.io/build-personal-ai-assistant/](https://ares0x.github.io/build-personal-ai-assistant/)

> **定位**：可运行、可演进、高解耦的个人助理内核。
> `tutorial` 分支对应教学 L1 Demo；`main` 面向工业级地基、多终端拓扑与插件生态。

---

## 核心特性与架构 (Phase A - E 100% 落地)

- **多厂商 Provider 传输层 (C1)**：解耦转换 Layer，原生支持 DeepSeek, Anthropic Claude, OpenAI, Moonshot/Kimi, Qwen/DashScope, Ollama 及第三方 OneAPI / NewAPI 中转站。
- **四层分层记忆与混合检索 (A / B3)**：Working / Session / Long-term / Archival 四层架构，基于 Embedding 向量余弦相似度检索与上下文自动去重衰减。
- **守护进程模式 Daemon Mode (C4)**：基于 Fastify 的 `apps/server` 长驻守护进程，托管唯一的 `@hachimi/core` 实例作为 Single Source of Truth，提供 REST API、SSE 流式打字机 (`text/event-stream`) 与 WebSocket 双向事件总线。
- **C5 传输层 Bearer Token 鉴权**：请求头 `Authorization: Bearer <token>` 与 URL 参数双重安全拦截，提供网络安全防护。
- **C6 对话中途转向 (Mid-turn Steering)**：借鉴 Pi 架构，支持在 Agent 处于 Tool Loop 执行中途发送 `steer()` 插队修正指令，以及 `followUp()` 队列连续排队。
- **C7 最小化工具执行沙箱 (ToolSandbox)**：为 `dangerous` 权限工具提供 30 秒超时断开熔断、1MB 控制台缓冲区 Cap 截断保护与环境隔离。
- **Phase D 可移植记忆 (Portable Memory)**：定义带有 `schemaVersion: 1` 和 SHA-256 `checksum` 的数据包契约 `HachimiBundleV1`，支持命令行与 REST 接口进行**一键导出、增量叠加合并/去重导入与 Schema 自动迁移**。
- **Phase E 统一扩展能力源与 MCP 接入**：
  - **`CapabilitySource<T>`** 归一化能力抽象；
  - **`SkillPackageLoader`** 动态扫描与按需装载 `~/.hachimi/skills/` 外部技能包；
  - **`HookRegistry`** 声明式 `preToolCall` / `postToolCall` / `sessionStart` 生命周期钩子；
  - **`McpClientManager`** 原生 Model Context Protocol (MCP) JSON-RPC Stdio 客户端集成。
- **双存储引擎支持**：支持原生 SQLite 存储引擎 (`SQLiteStore`) 与轻量文件存储 (`FileStore`)。

---

## 🚀 快速开始

### 环境要求

- Node.js ≥ 20
- pnpm ≥ 9

### 安装依赖

```bash
pnpm install
```

### 1. 启动 TUI 终端交互界面

```bash
pnpm dev:tui
```
- 输入 `/config` 打开可视化配置向导，在 DeepSeek、Claude、OpenAI 等模型厂商之间无缝切换。

### 2. 使用 CLI 命令行嵌入模式 (C2 & D2/D3)

```bash
# 纯文本模式（调用计算器工具）
pnpm dev:cli -p "帮我算一下 125 * 8 等于多少"

# 结构化 JSON 模式
pnpm dev:cli -j -p "用一句话介绍 Node.js"

# 数据包导出 (Portable Memory Export)
pnpm dev:cli --export ./my-backup.json

# 数据包导入 (Portable Memory Import with Additive Merge)
pnpm dev:cli --import ./my-backup.json
```

### 3. 启动 Daemon 守护进程服务 (C4 & C5)

```bash
# 本地开发模式启动（监听 http://127.0.0.1:3700）
pnpm dev:server

# 开启 Bearer Token 鉴权启动
HACHIMI_API_SECRET=my_secret_token pnpm dev:server
```

#### API 接口调用测试：

```bash
# 健康检查
curl http://127.0.0.1:3700/health

# REST 对话接口
curl -X POST http://127.0.0.1:3700/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "你好，请自我介绍一下", "provider": "deepseek"}'

# SSE 流式打字机模式
curl -N -X POST http://127.0.0.1:3700/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "解释什么是 AI Agent", "provider": "deepseek", "stream": true}'
```

### 4. 运行全量单元测试

```bash
pnpm test
```
*(通过 15 个测试套件，36 项单元测试 100% 绿灯)*

---

## 📂 项目结构

```text
hachimi/
├── apps/
│   ├── tui/                 # TUI 终端界面通道 (Terminal UI Channel)
│   └── server/              # Daemon 守护进程服务 (Fastify REST/SSE/WS Server)
├── packages/
│   ├── core/                # Agent / Memory v2 / Session / Skills / Tools / Portable / Extensions / Sandbox
│   │   ├── src/agent/       # Agent 核心循环与 steer/followUp
│   │   ├── src/extensions/  # CapabilitySource, HookRegistry, McpClient, SkillPackage
│   │   ├── src/portable/    # Portable Memory 导出、合并导入与 Migration
│   │   ├── src/runtime/     # AppContext 组装根与 createAgentSession SDK
│   │   └── src/sandbox/     # ToolSandbox 超时熔断与 Buffer Cap
│   ├── config/              # 统一配置与多厂商 Preset 模型管理
│   ├── storage/             # SQLiteStore 与 FileStore 双存储驱动
│   ├── shared/              # generateId, logger, utils
│   └── channels/
│       ├── cli/             # 嵌入式非交互 CLI 单轮通道与数据包导入导出工具
│       └── api/             # HTTP REST, SSE 流式打字机, WebSocket 传输层 API 模块
├── data/                    # 本地持久化数据与 SQLite 数据库 (gitignore)
├── docs/                    # 完整设计文档、ROADMAP、TASK 与阶段归档
└── package.json
```

---

## 🏁 开发路线图 (Roadmap Status)

| 阶段 | 内容 | 状态 |
|------|------|------|
| **Phase A** | 地基搭建、Config、Storage 文件驱动、四层记忆、TUI 通道 | **已完成 (Done)** |
| **Phase B** | 统一权限、Prompt-Cache 上下文、向量检索 v2、显式技能激活 | **已完成 (Done)** |
| **Phase C** | 多厂商 Provider、CLI 嵌入模式、Daemon 守护进程 (`apps/server`)、Auth 鉴权、Mid-turn Steering、Tool 沙箱 | **已完成 (Done)** |
| **Phase D** | 带 Schema 版本的可移植记忆、SHA-256 Checksum、一键导出/导入、增量合并去重、Schema 自动迁移 | **已完成 (Done)** |
| **Phase E** | 统一能力源 `CapabilitySource`、`~/.hachimi/skills/` 外部技能包、声明式 Hooks、MCP Client | **已完成 (Done)** |
| **Phase F** | 多终端 Client (Desktop / Telegram 机器人 / Web) + Tier 2 技能自演进 | 下一步 (Next) |
| **Phase G** | 复杂沙箱硬化、多客户端权限隔离与安全性审核 | 规划中 |

---

## 📜 相关链接

- 教程仓库：[https://github.com/ares0x/build-personal-ai-assistant](https://github.com/ares0x/build-personal-ai-assistant)
- 本仓库：[https://github.com/ares0x/hachimi](https://github.com/ares0x/hachimi)
