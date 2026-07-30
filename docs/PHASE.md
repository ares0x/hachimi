下面是一份**可执行的下阶段总计划**：在 Web/Desktop MVP 已可用的前提下，把重心转回 **Harness + Work/Activity 一等模型**。每阶段结束项目仍须**可运行、可测**。

---

# Hachimi 下阶段开发计划
**主题：** Runtime Native → Work-first → 可恢复、可策略、可演化
**原则：** 单脑 Daemon；UI 只投影；不新开第二套 Agent；参考他处只取机制不取整站照搬

---

## 总览时间线（建议 8–12 周，可按人力压缩）

| 阶段 | 名称 | 主题 | 主要对标吸取 |
|------|------|------|----------------|
| **W0** | 真相源与可恢复 | 事件流 / Session 续跑 | Event Log、Pi transcript |
| **W1** | Work 数据模型 | Goal/Plan/Status API | Craft/Codex 任务列表语义 |
| **W2** | 策略与多表面生产 | 权限、密钥、通道 | Hermes 通道策略、你方 H2/H4 |
| **W3** | Work-first UI 最小集 | Rail/Main/Inspector 换语义 | 上文 Work UI，非 Chat 皮 |
| **W4** | 演化闭环 F5 | 轨迹→技能提案→人审 | Hermes 学习环 |
| **W5** | 上下文与评测加固 | 剪枝、compaction、evals 扩展 | context 纪律、自有 Phase I |
| **W6** | 连接器（可选） | 日历等工具化 | MCP/工具，非套壳 App |

**并行约束：** Desktop 视觉大改、多 Agent 平台、Cola 式无列表、对外无限 MCP 暴露 → 默认不进本计划主线。

---

## Phase W0 — 执行真相源与可恢复（P0，约 1.5–2 周）

### 目标
进程杀掉再起后，**同一工作上下文可续**；工具与回合对**机器可读**（落实 Agent Native ③ + 部分 ①）。

### 任务

| ID | 内容 | 验收 |
|----|------|------|
| W0.1 | 定义 `RuntimeEvent` 最小集：`session_started` / `user_message` / `assistant_message` / `tool_call` / `tool_result` / `approval_*` / `steer` / `error` / `run_finished` | 类型进 `packages/core`，有 zod/TS 联合类型 |
| W0.2 | Append-only 落盘（按 session 分文件或 SQLite 表均可；**先一种做透**） | 每轮工具调用可从磁盘重放顺序 |
| W0.3 | 启动恢复：加载事件 → 重建 messages / 未完成 tool 边界 | kill `server` → 再起 → 同 session 续聊，历史工具不丢 |
| W0.4 | `GET /api/sessions/:id/events`（分页）+ 可选 SSE 订阅事件（不只 token） | curl/脚本可解析 JSON |
| W0.5 | 与现有 Session 存储对齐；迁移旧数据「无事件则从 messages 生成合成事件」或只支持新会话 | 文档说明兼容策略 |
| W0.6 | 单测：顺序、恢复后下一轮 context 含关键 tool_result | CI 绿 |

### 出口
「无 GUI 脚本：创建 session → 跑带工具的一轮 → 读 events → 重启 server → 再读 events 一致。」

---

## Phase W1 — Work 一等公民（数据与 API）（P0，约 1.5–2 周）

### 目标
产品与 API 从「只有 Session/Chat」升级为 **Work 承载目标与状态**；Session/Run 作为执行容器（落实 Work-first，而不先大改像素）。

### 任务

| ID | 内容 | 验收 |
|----|------|------|
| W1.1 | 模型：`Work { id, title, goal?, status, plan[], sessionId[], createdAt, updatedAt }`；`status ∈ active\|waiting\|blocked\|completed\|failed\|archived` | 存盘 + 类型导出 |
| W1.2 | 创建路径：用户首条 Intent → 生成/更新 Work（标题规则：截断用户句或模型短标题） | 不再出现大量「会话 时间戳」为主标题 |
| W1.3 | Plan：支持「先计划再执行」——结构化步骤 `pending\|running\|done\|skipped`；可先规则/模型 JSON，再演进 | API 可读写 plan |
| W1.4 | Activity 映射：W0 事件投影为 Activity（message 只是一类） | `list activities` 与 events 一致 |
| W1.5 | API：`POST /works`、`GET /works`、`GET /works/:id`、`PATCH`（status/plan）、内部仍驱动现有 agent loop | OpenAPI/Markdown 片段更新 `docs/API.md` |
| W1.6 | CLI：`hachimi work list` / `work show`（或 `dev:cli` 子命令） | 无浏览器可操作 |
| W1.7 | 子 Agent：挂在 parent Work 下，列表默认折叠 worker（产品层过滤） | Rail 不刷屏 Dedicated Worker |

### 吸取
- **Craft / Codex：** 任务/会话有状态与可读标题。
- **不吸取：** 重型 IDE 三栏文件树当默认。

### 出口
脚本可创建 Work、跑起来、查 status/plan/events；旧 Session API 保留为兼容或薄封装。

---

## Phase W2 — 策略引擎与多表面生产默认（P0，约 1–1.5 周）

### 目标
权限为 **Agent 规模** 服务（Claude ④）；无 GUI 与 GUI **同一策略**；Daemon 可安心常驻。

### 任务

| ID | 内容 | 验收 |
|----|------|------|
| W2.1 | 策略表落地：`surface × toolClass × action`（沿用 channelPolicy，扩展 web/desktop/tui） | 矩阵单测 + 实机 Telegram/Web |
| W2.2 | 显式 API：`approve_tool` / `deny_tool` / `cancel_run`（供 UI 与脚本） | 事件流出现 approval_* |
| W2.3 | 默认 `HACHIMI_API_SECRET`：首次启动生成并写入用户配置，拒绝默认同网裸奔 | 文档 + 行为测试 |
| W2.4 | CORS 白名单；绑定 `127.0.0.1` 默认 | 配置项说明 |
| W2.5 | 双客户端同时连同一 Work：不脑裂；steer 不丢 | 手工清单 |
| W2.6 | 审计：按 work/session 查询工具批准与拒绝 | 至少 CLI 或 GET API |

### 吸取
- **Hermes：** 通道级授权与配对思路。
- **自有 H2：** 管道与 channelPolicy，补「生产默认」而非重写管道。

### 出口
「先起 server（带 secret）→ Web/Telegram 按策略跑通 needs_confirm」写进 README 推荐路径。

---

## Phase W3 — Work-first UI 最小集（P1，约 1.5–2 周）

### 目标
Web（及 Desktop 壳）成为 **Runtime 状态投影**，不是更好的 ChatGPT 皮。

### 任务

| ID | 内容 | 验收 |
|----|------|------|
| W3.1 | Rail：`WORK` 列表（标题+状态点+相对时间）；去掉用户必选 Modes 或收入「能力说明」 | 无 Chat/Code/Research/Write 强选 |
| W3.2 | 空闲态保留「今天需要我接手什么？」+ 建议 Intent chips（写入 Work） | chip 真创建/发送 |
| W3.3 | 主区：选中 Work 显示 Goal / Plan 清单 / Activity 流（消息+工具块） | 选中与内容绑定 |
| W3.4 | Composer：对当前 Work 发言；Steer 文案/tooltip 明确 | 文档化快捷键 |
| W3.5 | Inspector **User 层**：当前步骤、用到的记忆/工具、是否在等待批准 | 默认非 Raw JSON |
| W3.6 | Inspector **Dev 层**（折叠）：events、token、request id | 开关分离 |
| W3.7 | Settings **子集**：模型、主题、secret 状态、Bundle 导入导出 | 与 Daemon 配置同源 |
| W3.8 | 共享：能抽则抽 `packages/ui` 的 Work 列表与 Activity；否则 web 先做透 | Desktop 可暂 webview 同源 |

### 吸取
- 产品长文：Work 中心、Activity、双层 Inspector。
- **Hermes：** 右栏按需。
- **不吸取：** Cola 砍掉工作列表。

### 出口
截图级：打开 3700 像「工作台」而非「时间戳聊天列表」。

---

## Phase W4 — 演化闭环 F5（P1，约 1.5 周）

### 目标
「越用越懂」有路径：轨迹 → 提案 → **人确认** → Skill（对标 Hermes，守住安全）。

### 任务

| ID | 内容 | 验收 |
|----|------|------|
| W4.1 | 从 completed Work 的 events 压缩候选（规则或 LLM） | 产出 `SkillProposal` 文件/表 |
| W4.2 | 提案默认 **不生效**；API/TUI/Web 一处 Confirm/Reject | 拒绝不进 skills 目录 |
| W4.3 | Confirm 后写入 `~/.hachimi/skills` 或正式 registry | 下轮可被激活 |
| W4.4 | 单测：无确认则 prompt 中无该 skill 全文 | CI |

### 出口
完整一次：做完任务 → 出提案 → 确认 → 新 skill 可用。

---

## Phase W5 — 上下文治理与评测加固（P1，约 1 周）

### 目标
长 Work 不爆；回归不靠感觉。

### 任务

| ID | 内容 | 验收 |
|----|------|------|
| W5.1 | tool_result 大小上限 + 摘要回灌策略 | 超大输出不撑爆 context |
| W5.2 | 可选 compaction（规则优先）与 ContextBuilder 契约测试更新 | 锁测试仍绿 |
| W5.3 | Evals：增加 `work_recovery`、`permission_deny`、`plan_then_act` 用例 | mock 模式 CI |
| W5.4 | 文档：Agent Native 四条与 Work 模型写入 `ARCHITECTURE.md` 一节 | 与实现一致 |


---

## Phase W6 — 连接器（可选，P2）

### 目标
日历等为 **Tool**，挂在 Work 执行上，不做成壳内 Gmail App。

| ID | 内容 | 验收 |
|----|------|------|
| W6.1 | 连接器接口：`Connector` + 鉴权落盘加密 | 可关 |
| W6.2 | 先 Google Calendar **只读** 或本机 ICS 文件 | `needs_confirm` 写操作 |
| W6.3 | 能力出现在 User Inspector「可用工具」 | 失败隔离不拖垮 loop |

---

## 明确不做（本阶段）

- 开 Desktop 强制再开浏览器页
- Web 与 Desktop 功能 100% 对等
- 用户必选 Chat/Code/Research/Write Modes
- 无边界「把整个 Agent 暴露给任意外部 Agent」
- AI 动态生成任意页面布局
- 重做视觉品牌或大范围 Desktop 原生集成（等 W0–W2 完成）

---

## 里程碑验收（对外可讲的故事）

1. **可恢复 Runtime：** 杀进程不丢执行事实。
2. **Work 一等：** 列表是工作状态，不是聊天时间戳。
3. **策略化权限：** 无 UI 与有 UI 同一套边界。
4. **投影式 UI：** 人看懂 Agent 在做什么、在等什么。
5. **人审演化：** 技能变强但不擅自改自己。

---

## 建议的两周起步切片（若只能先做一段）

**第 1–2 周只做 W0 + W1.1–W1.5：**
事件落盘与恢复 + Work 模型与 API。
UI 可仍用现壳，但 API 已 Work-first——避免先画后改。

---

## 文档与流程

- 每个 Phase 结束：更新 `docs/ROADMAP.md`、`docs/TASK.md`，完成项进 `docs/archive/`。
- `AGENTS.md` 增补：新功能优先 Work/Event，禁止表面内第二 Agent 循环。
- README「推荐日常」：`server` → Web；CLI 跑 Work；secret 必开。

---
