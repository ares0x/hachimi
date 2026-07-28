# Hachimi Active Task Backlog (TASK.md)

> **当前阶段**: Phase W — Runtime Native → Work-first → 可恢复、可策略、可演化
> **关联文档**: [`MOVE.md`](./MOVE.md) | [`PHASE.md`](./PHASE.md) | [`ROADMAP.md`](./ROADMAP.md) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`API.md`](./API.md)
> **前提**: Web/Desktop MVP 已可用（会话基础、Markdown 渲染、Logo/资产集成均已就绪）

---

## 🎯 阶段总览

| 阶段 | 名称 | 状态 | 核心目标 |
|------|------|------|----------|
| **W0** | 执行真相源与可恢复 | 🟢 已完成 | 事件流落盘、进程重启后续跑 |
| **W1** | Work 数据模型与 API | 🟢 已完成 | Work 成为一等公民，替代纯 Session 聊天 |
| **W2** | 策略引擎与生产默认 | 🟢 已完成 | 权限策略、API Secret、多表面生产可用；approve/deny 单测覆盖 |
| **W3** | Work-first UI 最小集 | 🟢 已完成 | UI 改语义，投影 Runtime 状态而非聊天列表；Desktop 对齐 Web |
| **W4** | 演化闭环 F5 | 🔴 未开始 | 轨迹→技能提案→人审→Skill 落地 |
| **W5** | 上下文治理与评测加固 | 🔴 未开始 | 长 Work 不爆 context，eval 覆盖新场景 |
| **W6** | 连接器（可选 P2）| 🔴 未开始 | 日历等工具化，非壳内 App |

---

## Phase W0 — 执行真相源与可恢复（P0，约 1.5–2 周）

> **目标**: 进程杀掉重启后，同一 Work 上下文可续；工具与回合对机器可读，落盘为事件流。

### W0.1 — 定义 RuntimeEvent 类型集

- [x] 在 `packages/core/src/types/` 下新建 `event.ts`，定义 `RuntimeEvent` 联合类型：
  - `session_started | user_message | assistant_message`
  - `tool_call | tool_result | approval_requested | approval_granted | approval_denied`
  - `steer | error | run_finished`
- [x] 每种 event 包含：`id`、`sessionId`、`type`、`timestamp`、`payload`（各类型独立结构）
- [x] 使用 Zod schema 验证并导出 TS 类型，通过 `packages/core/src/index.ts` 暴露公有类型
- [x] 单测：枚举所有 event 类型的 Zod parse 完整性

**验收**: 类型进 `@hachimi/core` 公有面，`pnpm typecheck` 无误

---

### W0.2 — Append-only 事件落盘

- [x] 新建 `packages/core/src/events/` 目录：
  - `event-store.ts`：接口 `IEventStore`（`append` / `list` / `tail`）
  - `file-event-store.ts`：按 session 分文件的 JSONL append 落盘（`~/.hachimi/events/{sessionId}.jsonl`）
  - `sqlite-event-store.ts`：可选 SQLite 实现（单表 events，索引 sessionId+timestamp）
- [x] **先把 file-event-store 做透**，sqlite 版本作为可选扩展
- [x] 从 `packages/core/src/index.ts` 导出 `IEventStore`、`FileEventStore`
- [x] `HarnessRuntime.execute()` 在各关键节点写入事件（user_message / assistant_message / tool_call / tool_result / approval_* / steer / run_finished / error）
- [x] 单测：顺序写入 5 条事件，读回顺序一致；多 session 隔离

**验收**: 每轮工具调用可从磁盘重放顺序；`pnpm test` 绿

---

### W0.3 — 启动恢复：事件重建 Context

- [x] `SessionManager` 启动时检测已有事件文件：
  - 若存在 JSONL，从事件重建 `messages[]`
  - 若有 `tool_call` 无对应 `tool_result`，标记该轮为未完成
- [x] `HarnessRuntime` 提供 `recoverSession(sessionId)` 方法
- [x] 旧数据兼容：无事件文件的旧 Session 直接加载 messages，可选标记 `legacy: true`
- [x] 集成测试：`kill server → 重启 → 同 session 续聊 → 历史工具结果不丢`

**验收**: 手工验证 server 重启后续聊；单测模拟恢复路径

---

### W0.4 — GET /api/sessions/:id/events API

- [x] `apps/server/src/routes/` 新增：
  - `GET /api/sessions/:id/events` — 分页列表（`?limit=50&cursor=<eventId>`）
  - `GET /api/sessions/:id/events/stream` — SSE 实时订阅（非 token 流）
- [x] 返回格式：`{ events: RuntimeEvent[], nextCursor?: string, total: number }`
- [x] 鉴权：同现有 API secret 机制
- [x] 更新 `docs/API.md` 增加 Events 一节

**验收**: `curl` 命令可解析 JSON 事件列表

---

### W0.5 — 旧数据兼容策略文档

- [x] `docs/ARCHITECTURE.md` 增加「事件系统」一节：新会话全量事件、旧会话 legacy 标记策略
- [x] `docs/API.md` 注明 events 端点与旧 messages 端点关系

**验收**: 文档与实现一致，无矛盾

---

### W0.6 — W0 单测套件

- [x] `packages/core/src/events/__tests__/event-store.test.ts`：
  - append 顺序保证
  - 多 session 隔离（A 的事件不混入 B）
  - 恢复后下一轮 context 含关键 tool_result
  - cursor 分页正确性
- [x] CI 集成全覆盖

**出口脚本**:
```bash
# 1. 创建 session → 跑带工具的一轮
# 2. curl 读 events → 有序 JSON
# 3. kill server → 重启 server
# 4. 再读 events → 结果一致
```

---

## Phase W1 — Work 数据模型与 API（P0，约 1.5–2 周）

> **目标**: 产品从「只有 Session/Chat」升级为 Work 承载目标与状态；Session 降级为执行容器。

### W1.1 — Work 数据模型定义

- [x] `packages/core/src/types/work.ts` 定义 `Work` 与 `PlanStep` 接口：
  - 字段：`id / title / goal? / status / plan[] / sessionIds[] / kind / parentWorkId? / createdAt / updatedAt`
  - `status ∈ active | waiting | blocked | completed | failed | archived`
  - `kind ∈ primary | worker`
- [x] Zod schema 验证，JSON 存盘；通过 `@hachimi/core` 公有面导出
- [x] 初始阶段：`workId === sessionId`（1:1 映射，后续可拆）

**验收**: 类型导出，`pnpm typecheck` 无误

---

### W1.2 — 标题自动生成

- [x] `WorkManager.generateTitle(firstUserMessage: string): string`：
  - 规则优先：截取首条用户消息前 40 字符，去除换行
  - 可选增强：LLM 生成短标题（5–8 字）
  - **禁止纯时间戳作为标题**
- [x] Session 创建路径：首次用户消息 → 同步生成 title → 写入 Work
- [x] 单测：多种消息长度、含换行、空消息的标题生成结果

**验收**: 新建 Work 后 `title` 为可读文本，非时间戳

---

### W1.3 — Plan 支持：先计划再执行

- [x] `WorkManager.updatePlan(workId, steps)` / `updateStepStatus(workId, stepId, status)`
- [x] Agent 可通过内置工具 `update_work_plan` 更新 plan
- [x] 有 plan 展示清单，无 plan 退化为纯 Activity 流（不强制每次有计划）
- [x] 单测：plan 读写、步骤状态流转

**验收**: API 可读写 plan；无 plan 的旧 Work 正常降级展示

---

### W1.4 — Activity 映射：事件投影

- [x] `WorkManager.listActivities(workId)` — 从 W0 事件流投影为 Activity 列表：
  - `user/assistant_message → Activity{ type:"message" }`
  - `tool_call + tool_result → Activity{ type:"tool" }`
  - `approval_* → Activity{ type:"approval" }`
  - `steer → Activity{ type:"steer" }`
  - `error → Activity{ type:"error" }`
- [x] 按时间排序，cursor 分页
- [x] 单测：events → activities 映射正确性

**验收**: list activities 与 raw events 一致

---

### W1.5 — Work REST API

- [x] `apps/server/src/routes/works.ts` 新增路由：
  - `POST /api/works` — 用 intent 创建（`{ intent, goal? }`）
  - `GET /api/works` — 列表（默认 `kind=primary`，支持 `?status=active`）
  - `GET /api/works/:id` — 详情（含 goal/plan/sessionIds）
  - `PATCH /api/works/:id` — 更新 status/plan/title
  - `GET /api/works/:id/activities` — Activity 分页列表
  - `POST /api/works/:id/steer` — 对当前 Work 的意图干预
- [x] Chat API 内部绑定 Work（接收可选 `workId` 参数）
- [x] 更新 `docs/API.md` Works 一节完整文档

**验收**: 脚本只通过 works API 跑通一轮带工具任务

---

### W1.6 — CLI：work 子命令

- [x] 现有 CLI 入口增加：
  - `hachimi work list` — 列出 primary Works（标题+状态+时间）
  - `hachimi work show <id>` — 显示 goal/plan/最近 activities
  - `hachimi work create --intent "..."` — 创建 Work（可选）
- [x] README 更新「推荐日常」路径

**验收**: 无浏览器可完成 list / show / run

---

### W1.7 — 子 Agent Work 过滤

- [x] 子 Agent 创建 session 时携带 `kind=worker` + `parentWorkId`
- [x] `GET /api/works` 默认过滤 `kind=primary`
- [x] `GET /api/works/:id/children` 查询子任务列表
- [x] UI 层：Worker 不与主 Work 平级展示，默认折叠

**验收**: Rail 不被大量 Worker 刷屏

---

## Phase W2 — 策略引擎与多表面生产默认（P0，约 1–1.5 周）

> **目标**: 权限策略为 Agent 规模服务；无 GUI 与 GUI 同一策略；Daemon 可安心常驻。

### W2.1 — 策略表落地与矩阵测试

- [x] 扩展 `channelPolicy` 为 `surface × toolClass × action` 矩阵：
  - surface: `web | desktop | tui | telegram | api | cli`
  - 策略: `deny | allow-safe | allowlist | allow-all`（allow-all 仅 TUI）
- [x] `packages/core/src/tools/policy.ts`：`isAllowed(surface, tool, permLevel)` 方法
- [x] 矩阵单测：web/telegram/tui × safe/needs_confirm/dangerous 9 种组合
- [x] 实机验证：Telegram 遵循 `allow-safe`（needs_confirm 工具被 hold）

**验收**: 矩阵单测 + 实机通过

---

### W2.2 — 显式审批 API

- [x] `POST /api/tools/approve` — 批准/拒绝待审工具（`{ approvalId, decision: "approve"|"deny" }`）
- [x] `POST /api/works/:id/cancel` — 取消正在运行的 Work
- [x] approve/deny → 写入 `approval_granted` / `approval_denied` 事件
- [x] Web UI：待审批时出现 Approve/Deny 按钮（关联 Activity 块）
- [x] 单测：approve → 工具继续执行；deny → 返回 cancelled 结果

**验收**: 事件流出现 `approval_*` 事件

---

### W2.3 — 默认 API Secret 生成

- [x] 首次启动若无 `HACHIMI_API_SECRET`：自动生成 32 字节 hex secret，写入 `~/.hachimi/config.json`
- [x] 启动日志提示（不打印 secret 本身）
- [x] 无 secret 时拒绝非 127.0.0.1 请求
- [x] README 增加「首次启动」与「Secret 管理」说明
- [x] 行为测试：无 secret → 自动生成并持久化

**验收**: 文档 + 行为测试通过；无默认同网裸奔

---

### W2.4 — CORS 白名单与绑定

- [x] 默认绑定 `127.0.0.1`（非 `0.0.0.0`）
- [x] CORS 白名单：允许 `http://localhost:*`，拒绝任意来源反射
- [x] 可配置 `server.host` / `server.allowedOrigins`

**验收**: 非白名单来源返回 403/CORS 错误；配置项说明完整

---

### W2.5 — 双客户端 Steer 不脑裂

- [x] 多 SSE 订阅者同时接收同一 session 事件推送
- [x] steer 通过事件写入，并发不丢失
- [x] 手工清单：两标签页同时打开同一 Work，交替发言，两端均可见

**验收**: 手工清单通过

---

### W2.6 — 审计查询

- [x] `GET /api/works/:id/events?type=approval_granted,approval_denied` — 按类型过滤
- [x] CLI：`hachimi work audit <id>` — 打印批准/拒绝记录
- [x] 输出格式：`timestamp | tool | decision | surface`

**验收**: CLI 或 API 可查询工具批准记录

---

## Phase W3 — Work-first UI 最小集（P1，约 1.5–2 周）

> **目标**: Web（及 Desktop 壳）成为 Runtime 状态投影，心智从「聊天列表」转为「工作台」。

### W3.1 — Rail：Work 列表替换 Session 列表

- [x] `packages/ui/src/components/work-list.tsx`：
  - 每项：状态点（颜色按 status）+ 可读标题 + 相对时间（`2h ago`）
  - 状态点颜色：`active`=蓝 / `waiting`=黄 / `blocked`=红 / `completed`=绿 / `archived`=灰
- [x] 去掉用户必选 Modes（Chat/Code/Research/Write）或移入设置
- [x] 新建按钮改为「+ 新工作」
- [x] 数据源：`GET /api/works`（primary only）

**验收**: 无 Mode 强选；列表展示 Work 标题+状态

---

### W3.2 — 空闲态：意图芯片创建 Work

- [x] 未选中 Work 时：欢迎语 + 建议 Intent chips（4–6 个，硬编码首批）
- [x] 点击 chip → 发送该意图 → 创建 Work → 切换到新 Work 主区
- [x] 文案示例：「今天需要我接手什么？」

**验收**: chip 真实创建/发送，非空动画

---

### W3.3 — 主区：Goal / Plan / Activity 三层

- [x] 选中 Work 后主区结构：
  1. **Goal 区**（顶部可折叠）：`work.goal` 文本
  2. **Plan 区**（若有）：步骤清单（pending/running/done/skipped 状态图标）
  3. **Activity 流**（主体）：消息气泡 + 工具调用块 + 审批块
- [x] 工具调用块：工具名 + 参数摘要 + 结果摘要（可展开）
- [x] 审批块：待审批时 Approve/Deny 按钮
- [x] **选中与内容严格绑定**：切换 Work 时内容完全切换，无全局 Hello 残留

**验收**: 选中 Work ≠ 全局 Hello；截图心智为工作台

---

### W3.4 — Composer：对当前 Work 发言

- [x] Composer 底部显示当前 Work 名称（`In: [Work 标题]`）
- [x] Steer 按钮 tooltip：「纠偏当前 Work 执行方向」
- [x] 快捷键：`⌘ Enter` 发送，`Shift+Enter` 换行（文档化）

**验收**: 用户清楚当前对哪个 Work 发言

---

### W3.5 — Inspector User 层（默认展示）

- [x] Inspector 面板默认 User 层：
  - **当前步骤**：正在执行的 Plan Step 名称（若有）
  - **用到的记忆**：本轮检索到的 Memory 条目（1–3 条）
  - **可用工具**：当前激活工具列表
  - **等待状态**：是否在等待用户审批（工具名+参数摘要）
- [x] 非 Raw JSON，友好可读展示

**验收**: 用户可理解 Agent 当前状态；默认非 Raw JSON

---

### W3.6 — Inspector Dev 层（折叠）

- [x] Inspector 底部可展开 Dev 层：
  - 原始事件流（最近 20 条）
  - Token 用量（prompt/completion）
  - Request ID（用于排查）
- [x] 折叠开关独立，不影响 User 层默认可见

**验收**: 默认折叠；开关分离

---

### W3.7 — Settings 子集

- [x] Settings 面板：
  - 模型选择（来自 config）
  - 主题切换（Light/Dark）
  - Secret 状态展示（是否已配置，不展示值）
  - Bundle 导入/导出（复用现有 PortableBundle）
- [x] 与 Daemon 配置同源（读写 `~/.hachimi/config.json`）

**验收**: 与 Daemon 配置同源

---

### W3.8 — 共享 UI 组件抽取

- [x] `WorkList`、`ActivityTimeline`、`PlanTracker` 抽入 `packages/ui`
- [x] Desktop 可 webview 同源复用（不要求 100% 对等）
- [x] Desktop `apps/desktop/src/App.tsx` 已对齐 Web Work-first UI（WorkList 替代旧 Sidebar，完整三层 Goal/Plan/Activity）

**验收**: `packages/ui` 导出三组件

---

## Phase W4 — 演化闭环 F5（P1，约 1.5 周）

> **目标**: 「越用越懂」有路径；轨迹→提案→人确认→Skill 落地；守住安全红线。

### W4.1 — TrajectoryCompressor：从 Work Events 提取技能候选

- [ ] 扩展 `packages/core/src/skills/trajectory-compressor.ts`：
  - 输入：completed Work 的 events
  - 输出：`SkillProposal[]`（名称、描述、触发条件、示例步骤）
  - 规则优先（重复模式检测）；可选 LLM 辅助摘要
- [ ] 新建 `packages/core/src/skills/skill-proposal-manager.ts`：管理提案状态（pending/accepted/rejected）
- [ ] 提案存储：`~/.hachimi/proposals/` 目录，每条独立 JSON 文件

**验收**: 产出 `SkillProposal` 文件/表

---

### W4.2 — 提案默认不生效，需人 Confirm

- [ ] 提案状态默认 `pending`，不自动进入 skills 目录
- [ ] `GET /api/skills/proposals` — 列出待审提案
- [ ] `POST /api/skills/proposals/:id/accept` — 确认接受
- [ ] `POST /api/skills/proposals/:id/reject` — 拒绝
- [ ] TUI / Web UI 均可操作（至少 API 可操作）
- [ ] 单测：无确认则 prompt 中无该 skill 全文

**验收**: 拒绝不进 skills 目录；单测覆盖

---

### W4.3 — Confirm 后写入技能注册

- [ ] Accept 后将 SkillProposal 写入 `~/.hachimi/skills/`，`SkillRegistry` 重新扫描
- [ ] 技能来源标注：`source: "learned"`（区别于 builtin / external）

**验收**: 完整流程：做完任务 → 出提案 → 确认 → 新 skill 可用

---

### W4.4 — F5 单测

- [ ] 无确认 → prompt 中无该 skill（状态隔离）
- [ ] 确认 → skill 在下一 context 中出现
- [ ] 拒绝 → skill 永久不在 prompt 中（除非重新提案）

**验收**: CI 绿

---

## Phase W5 — 上下文治理与评测加固（P1，约 1 周）

> **目标**: 长 Work 不爆 context；回归不靠感觉；eval 覆盖 Work 新场景。

### W5.1 — tool_result 大小上限与摘要回灌

- [x] ContextBuilder 层：tool_result 超过 8KB 时自动截断+摘要
  - 摘要规则：头 200 字符 + 尾 200 字符 + `[...截断 X 字节...]`
- [x] 配置项：`context.toolResultMaxBytes`（默认 8192）
- [x] 单测：超大输出不撑爆 context

**验收**: 超大工具输出被截断并摘要；单测通过

---

### W5.2 — 可选 Compaction 与 ContextBuilder 契约更新

- [ ] 规则优先 compaction：messages 超过 30 轮时压缩旧轮为摘要块
- [ ] ContextBuilder 契约测试更新：覆盖 compaction 场景
- [ ] 锁测试仍绿（静态 prefix 顺序不变）

**验收**: 锁测试绿；长会话不超 token 限制

---

### W5.3 — Evals 新用例

- [ ] `packages/evals/` 新增：
  - `work_recovery`：模拟 server 重启后 Work 续跑（mock 模式）
  - `permission_deny`：dangerous 工具在 deny 策略下被拒绝，对话不中断
  - `plan_then_act`：Agent 先输出 plan 步骤，再逐步执行（多轮）
- [ ] Mock 模式 CI 通过（零成本回归）

**验收**: 3 个新 eval 用例 CI mock 模式通过

---

### W5.4 — ARCHITECTURE.md 更新

- [ ] 增加「事件系统（RuntimeEvent）」一节：类型、落盘、恢复
- [ ] 增加「Work 模型」一节：Work/Session/Activity 关系
- [ ] 增加「Agent Native 四条」说明（对齐 PHASE.md 目标）
- [ ] 确保文档与实现一致（code wins）

**验收**: 文档更新；与实现无矛盾

---

## Phase W6 — 连接器（可选 P2）

> **目标**: 日历等为 Tool，挂在 Work 执行上，非壳内 App。

### W6.1 — Connector 接口定义

- [ ] `packages/core/src/extensions/connector.ts`：`IConnector` 接口定义
- [ ] 鉴权 token 加密存储（`~/.hachimi/connectors/`，AES-256 或 OS Keychain）
- [ ] 连接器可单独关闭，不影响主 loop

### W6.2 — 本机 ICS / Google Calendar 只读

- [ ] 先实现本机 ICS 文件读取工具（无需 OAuth，验证连接器流程）
- [ ] `needs_confirm` 对写操作；`safe` 对只读查询
- [ ] 工具失败隔离：连接器异常不拖垮 Agent loop

### W6.3 — 能力出现在 Inspector

- [ ] User 层「可用工具」列表包含 Calendar 工具（若已配置连接器）
- [ ] 失败状态（auth 过期）有清晰提示

**验收**: 本机 ICS 工具可在 Work 执行中被调用；失败不崩 loop

---

## 📌 明确不在本阶段范围

- 删除 Message 存储、全面只存 event（更远期）
- AI 动态生成整页 UI 布局
- 多个并列人格 Agent Mode 墙
- Web 与 Desktop 功能 100% 对等
- 开 Desktop 强制打开浏览器
- 无边界把「整个 Hachimi」暴露为任意外部 Agent 的无限工具
- 重做视觉品牌或大范围 Desktop 原生集成（等 W0–W2 完成后再考虑）

---

## 📐 两周起步切片（建议优先）

**第 1–2 周只做 W0 + W1.1–W1.5：**
> 事件落盘与恢复 + Work 模型与 API
> UI 可仍用现壳，但 API 已 Work-first——避免先画后改

```bash
# 里程碑验证脚本
curl -H "Authorization: Bearer $SECRET" http://localhost:3000/api/works
# 期望：返回 Work 列表（非空时间戳列表）

curl -H "Authorization: Bearer $SECRET" http://localhost:3000/api/sessions/:id/events
# 期望：返回可读事件流 JSON
```

---

## 📜 历史阶段已完成任务归档

- [x] **Phase A**: 基础架构、四层记忆、Tool/Skill 注册表与 TUI → 见 [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)
- [x] **Phase B**: 统一权限、ContextBuilder、向量检索 v2、显式技能激活 → 见 [`archive/PHASE_B_TASK.md`](./archive/PHASE_B_TASK.md)
- [x] **Phase C**: Multi-Provider 传输层、CLI 嵌入、Daemon (`apps/server`)、Auth、Steer、沙箱 → 见 [`archive/PHASE_C_TASK.md`](./archive/PHASE_C_TASK.md)
- [x] **Phase D**: 可移植记忆 Bundle、Checksum、导入导出、Schema 迁移 → 见 [`archive/PHASE_D_TASK.md`](./archive/PHASE_D_TASK.md)
- [x] **Phase E**: `CapabilitySource`、外部技能包、声明式 Hooks、MCP Client → 见 [`archive/PHASE_E_TASK.md`](./archive/PHASE_E_TASK.md)
- [x] **Phase F2/F3**: Telegram Bot Gateway、Web UI Client（MVP）
- [x] **Phase F4**: SubAgent 硬化（防递归、Worker Prompt、预算限制）
- [x] **Phase H1/H2**: 管道闭合、ContextBuilder、三级权限、沙箱、Circuit Breaker、Hooks、MCP 对齐、Channel Policy、时间注入
- [x] **Phase I**: Agent Capability Eval Framework（5 域、三级 Grader、Mock CI 模式）
- [x] **Web/Desktop MVP**: 会话基础、Markdown 渲染（含表格）、Logo 资产集成、.gitignore 整理
