# Archived Tasks: Phase C — Provider Abstraction + Runtime Topology

> **完成时间**: 2026-07-24
> **关联文档**: [`ROADMAP.md`](../ROADMAP.md) | [`ARCHITECTURE.md`](../ARCHITECTURE.md) | [`PROJECT.md`](../PROJECT.md)

- [x] **C1**: `ProviderTransport` 接口抽象与多厂商支持 (OpenAI, Anthropic Claude, DeepSeek, Kimi, Qwen, Ollama, OneAPI/NewAPI)。
- [x] **C2**: 嵌入模式非交互式单轮 CLI 入口 (`--print` 纯文本与 `--json` 结构化输出)。
- [x] **C3**: `@hachimi/core` 统一 SDK 导出与 `createAgentSession()` 入口。
- [x] **C4**: Daemon 守护进程 `apps/server` 与 Fastify REST API / SSE / WebSocket 双向打字机。
- [x] **C5**: 传输层 Bearer Token 安全鉴权机制 (`HACHIMI_API_SECRET` & `secretKey`)。
- [x] **C6**: Mid-turn Steering 对话中途转向 (`agent.steer()` / `agent.followUp()`)。
- [x] **C7**: 最小化工具执行隔离沙箱 (`ToolSandbox` 超时熔断与 Buffer Cap 截断保护)。
