# Hachimi Active Task Backlog (TASK.md)

> **当前阶段**: Phase C — Provider 抽象与 Daemon 运行拓扑 (Provider Abstraction + Runtime Topology)  
> **关联文档**: [`PROJECT.md`](./PROJECT.md) | [`ROADMAP.md`](./ROADMAP.md) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)

---

## 📌 Phase C 任务清单与状态

### 1. C1 — `ProviderTransport` 接口抽象 (Provider Transport Abstraction)
- [ ] **C1.1**: 定义统一的 `ProviderTransport` 接口契约，实现底层消息与工具调用的转译隔离。
- [ ] **C1.2**: 将 `openai-compatible.ts` 重构适配为首个 `ProviderTransport` 实例，将 OpenAI 格式转换逻辑抽离出 `Agent`。

### 2. C2 — 嵌入模式非交互式单轮入口 (Embedded Print/JSON Mode)
- [ ] **C2.1**: 在 `packages/channels/cli` 中实现嵌入式单轮非交互执行入口，支持 `--print` 纯文本与 `--json` 结构化输出。
- [ ] **C2.2**: 用于 CLI 命令行工具链组合、脚本自动化、Cron 定时任务与测试脚本。

### 3. C3 — `@hachimi/core` SDK 导出与 `createAgentSession` 统一入口
- [ ] **C3.1**: 从 `@hachimi/core` 显式导出 `createAppContext()` / `createAgentSession()` 编程式 SDK 入口。
- [ ] **C3.2**: 为 Embedded 嵌入模式（如 TUI/CLI）与 Daemon 守护进程模式（`apps/server`）提供完全一致的实例化接口。

### 4. C4 — Daemon 模式：落地长驻守护进程 `apps/server`
- [ ] **C4.1**: 完善 `apps/server` 逻辑，使其启动并托管唯一的 `@hachimi/core` 实例（多终端 Single Source of Truth）。
- [ ] **C4.2**: 基于 Fastify / Node HTTP & WebSocket 提供本地 REST / WS 通信 API 接口。

### 5. C5 — 本地传输层 Token 鉴权 (Transport Auth)
- [ ] **C5.1**: 实现守护进程 API 的最小传输层 Token 鉴权机制（Bearer Token / Secret Key）。
- [ ] **C5.2**: 在任何远程客户端或非 TUI 通道（如 Telegram 桥接、浏览器 Client）接入前提供基本网络安全防护。

### 6. C6 — 对话中途转向 (Mid-turn Steering - Stretch Goal)
- [ ] **C6.1**: 借鉴 Pi 的 `steer()` / `followUp()` 模式，支持在 Agent 处于 Tool Loop 执行中途时，客户端追加新指令或修正转向。

---

## 📂 相关文档归档与关联

- [`PROJECT.md`](./PROJECT.md) — **项目 PRD 文档**
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — **系统架构设计说明书**
- [`ROADMAP.md`](./ROADMAP.md) — **项目阶段路线图**
- [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md) — **Phase B 已完成任务归档**
