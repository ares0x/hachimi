# Hachimi Active Task Backlog (TASK.md)

> **当前阶段**: Phase W5.5 — Harness 正确性前置修补
> **关联文档**: [`VISION.md`](./VISION.md) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`ROADMAP.md`](./ROADMAP.md) | [`API.md`](./API.md)
> **前提**: Web/Desktop MVP 已可用；Phase W0-W5 基础设施已全面闭环

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
| **W6** | 连接器（可选 P2） | ⚪ 搁置 | 日历等工具化，非壳内 App |

---

## Phase W5.5 — Harness 正确性前置修补（约 0.5–2 天，W6 之前必须清完）

> **目标**: 修复会污染后续工具/loop 工作的具体正确性与安全问题。

### W5.5.1 — 修 read_file 的二进制探测内存峰值
- [x] `packages/core/src/tools/builtin/fs/read-file.ts` 中 `const fdHead = readFileSync(safePath).subarray(0, head.length)` 会把整个文件读进内存，只为了截取前 8000 字节做二进制判断——跟大文件时的 harness 安全目标直接矛盾。改成 `openSync` + `readSync` 只读前 8KB（不要动 `readTextFileByLine` 的流式行读取逻辑）。
- [x] **验收**: 对 100MB+ 测试文件调用 `read_file`，内存不随文件大小线性增长；单测覆盖二进制探测与文本流式读取。

---

### W5.5.2 — 审计并补齐所有入口的 channel 注入
- [x] 审计 `packages/channels/api/src/server.ts` 中 `steer` / `followup` 等端点，确保其使用显式 fallback。
- [x] 确认 `apps/desktop` 在通过 `packages/ui/src/api/index.ts` 调用时显式传入 `channel: "desktop"`。
- [x] 编写端点-channel 对照表并写在 `TASK.md` 中。
- [x] **验收**: 单测覆盖“未传 channel 时不会静默通过策略检查”。

#### 端点 - Channel 映射审计对照表

| 端点 / 入口 | 处理函数 / 文件 | 允许 / 传入 Channel | 缺省 Fallback 策略 |
|---|---|---|---|
| `POST /api/chat` (SSE) | `server.ts` | `body.channel` | `"web-sse"` |
| `POST /api/chat` (JSON) | `server.ts` | `body.channel` | `"api-json"` |
| `POST /api/chat/steer` | `server.ts` | `body.channel` | `"web-sse"` / `"api-json"` |
| `POST /api/works/:id/steer` | `server.ts` | `body.channel` | `"web"` |
| `GET /api/ws` | `server.ts` | `payload.channel` | `"ws"` |
| Desktop App SDK | `packages/ui/src/api/index.ts` | `"desktop"` | `"desktop"` |
| Web App SDK | `packages/ui/src/api/index.ts` | `"web-sse"` | `"web-sse"` |
| CLI Channel | `packages/channels/cli/src/index.ts` | `"cli"` | `"cli"` |
| Telegram Channel | `packages/channels/telegram/src/bot.ts` | `"telegram"` | `"telegram"` |
| TUI Application | `apps/tui/src/ui/app.ts` | `"tui"` | `"tui"` |
| SubAgent Worker | `packages/core/src/agent/sub-agent.ts` | `"sub-agent"` | `"sub-agent"` |
| Evals Framework | `packages/evals/src/runner.ts` | `"evals"` | `"evals"` |

---

### W5.5.3 — 理清默认审批 handler 与 decide() 的双重判定关系
- [x] `createAppContext` 默认 handler 走 `permissionPolicy.isAllowed()`（只有 allow 才为真，require_approval 视为拒绝），而 `agent.ts`（357行）和 `tools/registry.ts`（193行）各自独立调用一次 `policy.decide()`。
- [x] 补齐回归测试（包含 headless 无 UI 回调 + require_approval 场景），并在代码里添加注释说明两层判定的用途与协同关系。
- [x] **验收**: 新增测试覆盖 headless 无 UI 回调 + require_approval 权限组合，断言判定结果一致。

---

### W5.5.4 — 处理 agent.ts 里 "请记住" 硬编码前缀快捷路径
- [x] `agent.ts` 中的 `rememberPrefixes = ["请记住", "记住", "帮我记一下", "记一下"]` 快捷路径绕过了工具调用与 policy/channel 判定。
- [x] 重构该快捷路径使其内部调用真正的 memory 工具，使其走同一套 policy 和 `RuntimeEvent` 事件记录路径。
- [x] **验收**: 该路径产生的记忆写入在 `RuntimeEvent` 事件流中可查到对应记录。

---

## Phase W6 — 连接器（可选 P2，已搁置）

> **目标**: 日历等为 Tool，挂在 Work 执行上，非壳内 App。

- [ ] **W6.1** — Connector 接口定义与 Keychain/AES 加密存储
- [ ] **W6.2** — 本机 ICS / Google Calendar 只读工具
- [ ] **W6.3** — Inspector 界面能力曝光与失败隔离

---

## 📜 历史阶段已完成任务归档 (W0 - W5)

- **Phase W0** — 执行真相源与可恢复 (`RuntimeEvent`, `FileEventStore`, SSE event stream)
- **Phase W1** — Work 数据模型与 API (`Work`, `WorkPlan`, `Activity` 投影, Works API, CLI `hachimi work`)
- **Phase W2** — 策略引擎与生产默认 (`PermissionPolicy`, `POST /api/tools/approve`, API Secret, CORS)
- **Phase W3** — Work-first UI 最小集 (`WorkList`, Goal/Plan/Activity 三层主区, PermissionDock, Inspector)
- **Phase W4** — 演化闭环 F5 (`TrajectoryCompressor`, `SkillProposalManager`, `~/.hachimi/proposals/`, Accept/Reject 人审)
- **Phase W5** — 上下文治理与评测加固 (`tool_result` 8KB 截断, >30 轮规则 Compaction, 9 大 Eval benchmark 用例)
- **Phase A–I 历史归档** — 见 `archive/` 目录
