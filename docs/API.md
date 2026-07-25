# `@hachimi/core` 核心公开 API 冻结规范 (H1.2)

文档描述 `@hachimi/core` 模块导出的所有公开 API Surface，作为核心包与其他 Channel 适配层（CLI、Web API Daemon、Telegram Bot、TUI 等）交互的唯一标准化契约。

**禁止规则**：外部任何 Channel 或 App **禁止深路径导入 (`deep import`)** 内部源文件（如 `import { Agent } from "@hachimi/core/src/agent/agent.js"`），必须且只能导入 `@hachimi/core` 顶级出口。

---

## 核心 API Surface 导出清单

### 1. 核心 Harness 运行时 (HarnessRuntime Orchestrator)
- **`HarnessRuntime`**：统一全渠道 Agent 运行时控制主类。
  - `execute(input: RuntimeInput): Promise<RuntimeOutput>`
  - `steer(prompt: string): boolean`
  - `followUp(prompt: string): void`
  - `getStatus(): AppStatus`
  - `exportBundle(options?): Promise<HachimiBundleV1>`
  - `importBundle(source, options?): Promise<ImportBundleResult>`
- **`createHarnessRuntime(options?)`**：工厂函数，创建新的 `HarnessRuntime` 实例。
- **`getOrCreateHarnessRuntime(options?)`**：单例/工厂函数，获取或创建全局共享的 `HarnessRuntime` 实例。

### 2. 子 Agent 派发与自演化 (Sub-Agent & Experience)
- **`SubAgentDelegator`**：极简子 Agent 隔离派发器，支持 `async: true` 非阻塞后台派发与 `check_subagent_status` 检索。
- **`TrajectoryCompressor`**：交互轨迹压缩器，提炼工具链与用户纠正模式。
- **`SkillProposalManager`**：人在回路 (Human-in-the-Loop) 技能草案管理器，只有用户在 TUI/Web/REST 显式 Accept 后才写入 `~/.hachimi/skills/` 生效。
- **`ProactiveScheduler`**：支持 Cron 表达式与定时间隔的主动提醒调度器。

### 3. 组装根与会话 SDK (Composition Root & Session SDK)
- **`createAppContext(options?)`**：底层 Composition Root，初始化配置、SQLite 存储、Memory、Tools、Skills、Hooks 与 Agent。
- **`createAgentSession(options?)`**：高阶 SDK 函数，返回绑定特定 `sessionId` 的 `AgentSession` 实例。

### 4. 核心 Agent 循环 (Agent & Providers)
- **`Agent`**：Agent 主循环控制类，支持中途转向与工具调用。
- **`createLLMFromConfig(config)`**：LLM Provider 工厂函数。
- **`ProviderRegistry`**：多厂商 Preset LLM 传输层注册表。
- **`MockLLMProvider`** / **`OpenAICompatibleProvider`** / **`AnthropicProviderTransport`**：基础 LLM 传输层。

### 5. 扩展与插件引擎 (Extensions & Hooks)
- **`HookRegistry`**：生命周期 Hook 注册表（`onSessionStart`, `onPreToolCall`, `onPostToolCall`）。
- **`McpClientManager`**：MCP (Model Context Protocol) Stdio 客户端管理器。
- **`SkillPackageLoader`**：外部 `~/.hachimi/skills/` 技能包扫描加载器。

### 6. 记忆与便携式 Memory (Memory & Portable)
- **`MemoryManager`**：四层混合存储与向量检索记忆管理器。
- **`exportBundle` / `importBundle` / `migrateBundleToLatest`**：便携记忆包导出、叠加合并导入与 Schema 自动迁移。

### 7. 工具与沙箱 (Tools & Sandbox)
- **`ToolRegistry`**：工具注册表与熔断器 (Circuit Breaker)。
- **`ToolSandbox`**：工具执行 30s 统一超时、1MB Buffer 截断与敏感环境变量脱敏 (Env Scrubbing)。
- **`PathJail`**：工作区路径狱越界防护。

### 8. 数据契约与类型 (Data Contracts & Types)
- **`RuntimeInput`** / **`RuntimeOutput`** / **`ChannelType`** / **`Message`** / **`Session`** / **`SubAgentTaskState`** / **`SkillDraft`** / **`TriggerTask`** 等。
