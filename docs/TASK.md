# Hachimi Active Task Backlog (TASK.md)

> **当前阶段**: Phase C — Provider 抽象与 Daemon 运行拓扑 (Provider Abstraction + Runtime Topology)
> **关联文档**: [`PROJECT.md`](./PROJECT.md) | [`ROADMAP.md`](./ROADMAP.md) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)

---

## 📌 Phase C 任务清单与状态

### 1. C1 — `ProviderTransport` 接口抽象与多厂商支持 (Multi-Provider Transport Abstraction) (Done)
- [x] **C1.1**: 定义统一且通道/厂商解耦的 `ProviderTransport` 接口契约（解耦 `Agent` 与具体厂商 API 报文格式）。
- [x] **C1.2**: 支持主流大模厂商与 API 中转站（OpenAI, Anthropic Claude, DeepSeek, Moonshot/Kimi, Qwen/DashScope, Ollama 等）。
- [x] **C1.3**: 抽离统一的 HTTP/SSE 流式 Reader 与代理 (Custom BaseURL / Proxy / Headers) 配置，完美适配第三方 OneAPI / NewAPI 中转站。
- [x] **C1.4**: 将现有的 `openai-compatible.ts` 重构为 `OpenAICompatibleProvider` 并新增 `AnthropicProviderTransport` 验证通用兼容性。

### 2. C2 — 嵌入模式非交互式单轮入口 (Embedded Print/JSON Mode) (Done)
- [x] **C2.1**: 在 `packages/channels/cli` 中实现嵌入式单轮非交互执行入口，支持 `--print` 纯文本与 `--json` 结构化输出。
- [x] **C2.2**: 用于 CLI 命令行工具链组合、脚本自动化、Cron 定时任务与测试脚本。

### 3. C3 — `@hachimi/core` SDK 导出与 `createAgentSession` 统一入口 (Done)
- [x] **C3.1**: 从 `@hachimi/core` 显式导出 `createAppContext()` / `createAgentSession()` 编程式 SDK 入口。
- [x] **C3.2**: 为 Embedded 嵌入模式（如 TUI/CLI）与 Daemon 守护进程模式（`apps/server`）提供完全一致的实例化接口。

### 4. C4 — Daemon 模式：落地长驻守护进程 `apps/server` (Done)
- [x] **C4.1**: 完善 `apps/server` 逻辑，使其启动并托管唯一的 `@hachimi/core` 实例（多终端 Single Source of Truth）。
- [x] **C4.2**: 基于 Fastify / Node HTTP & WebSocket 提供本地 REST / WS 通信 API 接口。

### 5. C5 — 本地传输层 Token 鉴权 (Transport Auth) (Done)
- [x] **C5.1**: 实现守护进程 API 的最小传输层 Token 鉴权机制（Bearer Token / Secret Key）。
- [x] **C5.2**: 在任何远程客户端或非 TUI 通道（如 Telegram 桥接、浏览器 Client）接入前提供基本网络安全防护。

### 6. C6 — 对话中途转向 (Mid-turn Steering - Stretch Goal) (Done)
- [x] **C6.1**: 借鉴 Pi 的 `steer()` / `followUp()` 模式，支持在 Agent 处于 Tool Loop 执行中途时，客户端追加新指令或修正转向。

### 7. C7 — 最小化工具执行沙箱 (Minimum Tool-Execution Sandbox) (Done)
- [x] **C7.1**: 为 `dangerous` 权限等级工具提供 Docker 或 WASM 隔离执行环境，独立于现有的进程内审批门控。
- [x] **C7.2**: 在此提前实现的原因：Phase F 计划接入 Telegram（第一个不由本机操作者直接触发的远程客户端），若在此之前完全没有任何执行隔离层，风险敞口过大。此项不需要做到最终成熟形态（那是 Phase G1 的范畴），只需要在 Phase F 落地前存在。

---

## 📂 相关文档归档与关联

- [`PROJECT.md`](./PROJECT.md) — **项目 PRD 文档**
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — **系统架构设计说明书**
- [`ROADMAP.md`](./ROADMAP.md) — **项目阶段路线图**
- [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md) — **Phase B 已完成任务归档**
