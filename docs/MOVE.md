# 从现有设计迁移到 Work-first / Runtime Native 设计

本文描述 **Hachimi 从「Chat-first 助理壳」迁到「Work-first、事件为真相源的个人 Runtime」** 需要改什么、怎么兼容、分几步搬，以及迁移中明确不做什么。

---

## 1. 迁移在解决什么问题

### 1.1 现有设计（As-Is）

```text
用户打开应用
  → 选择 Mode（可选：Chat / Code / Research / Write）
  → 创建或点选 Session（常以时间戳命名）
  → 在中心区域收发 Message
  → 工具调用嵌在对话里
  → Inspector / Runtime 标签偏说明或调试
```

**隐含产品模型：**

| 概念 | 角色 |
|------|------|
| Session | 一等公民（聊天线程） |
| Message | 主数据与主 UI |
| Mode | 用户先选的「用哪种 AI」 |
| Agent 循环 | 已在 core，但被「聊天」隐喻盖住 |
| 权限 / 工具 / 记忆 | 已有实现，投影弱 |

**对应体验：** AI-enhanced Chat；有 Agent 能力，但心智仍是 ChatGPT + 工具。

### 1.2 目标设计（To-Be）

```text
用户表达 Intent（自然语言或建议 chip）
  → Runtime 创建或更新 Work（目标、状态、计划）
  → 执行产生 Activity（消息、工具、审批、产物…）
  → 事件落盘，可恢复、可脚本读取
  → UI 投影 Work 状态；对话是控制面，不是唯一数据模型
```

**隐含产品模型：**

| 概念 | 角色 |
|------|------|
| Work | 一等公民（一件要完成的事） |
| Activity / Event | 机器可读事实流 |
| Session / Run | Work 下的执行与上下文容器 |
| Message | Activity 的一种 |
| Capability | 由 Runtime 路由，非用户必选 Mode |
| UI | Runtime 状态投影 |

**对应体验：** Personal Agent Runtime；人观察、引导、在关键点批准。

### 1.3 一句话

> **不是换一套更炫的聊天皮，而是把「真相源」从 Message 列表提升为 Event/Activity，把「产品中心」从 Session 提升为 Work；Session 与 Chat UI 降级为容器与交互层。**

---

## 2. 概念映射表（迁移词典）

| 现有说法 / 实现 | 目标说法 | 迁移策略 |
|-----------------|----------|----------|
| Session | Work 的默认 Run/Session，或 1:1 先等同再拆 | 保留表/ID；增加 Work 字段或外键 |
| 会话列表 | Work 列表 | UI 改文案与展示字段（status/title） |
| 新会话 / + New | 新工作 / 从意图创建 | 创建 API 走 Work |
| Modes（Chat/Code/…） | Capabilities / 路由结果 | UI 去掉必选；能力进 Inspector/设置 |
| 用户消息 / 助手消息 | Activity（type=message） | 存储可仍用 messages；投影为 Activity |
| Tool call 卡片 | Activity（type=tool_call/result） | 与 Event 对齐 |
| Steer | 对当前 Work/Run 的干预 | API 保留，写入 event |
| needs_confirm 弹窗 | Activity（type=approval）+ 策略引擎 | 同一策略，多表面 |
| Inspector 元数据 | User Inspector + Dev Inspector | 拆层，同源 events |
| single brain runtime 标签 | Runtime 状态摘要 | 可点开，非装饰 |
| Portable Bundle | 仍对 Memory；可扩展导出 Work 摘要 | 先不阻塞主迁移 |
| Sub-agent 会话平铺 | Child Work 或隐藏 worker | 列表过滤 |

---

## 3. 数据模型迁移

### 3.1 目标结构（逻辑）

```text
Work
├── id, title, goal?, status, plan[]
├── createdAt, updatedAt
└── runs[] / sessions[]
      └── Session (现有会话实体可复用)
            └── events[] / activities[]   // 真相源
                  ├── message
                  ├── tool_call / tool_result
                  ├── approval
                  ├── steer
                  ├── plan_updated
                  ├── artifact
                  └── error / run_finished
```

### 3.2 与现状的兼容策略（推荐「加厚」而非「推倒」）

**阶段 A — 加字段，不删表**

- 在现有 `Session`（或并行 `works` 表）上增加：
  - `title`（可读标题）
  - `status`
  - `goal`（可选）
  - `plan`（JSON 数组，可选）
  - `kind`：`primary` | `worker`（子 Agent）
- 无 Work 表时：**一个 primary Session ≡ 一个 Work**（`workId === sessionId` 临时约定）。

**阶段 B — 事件流**

- 新建 `events`（文件或 SQLite）：只追加。
- 每次 user/assistant/tool/approval/steer 写一条。
- 旧 Session 仅有 messages：启动时 **一次性回填合成事件**，或标记 `legacy: true` 仅支持正向新事件。

**阶段 C — Work 实体独立（可选）**

- `works` 与 `sessions` 分离：一个 Work 多 Run（分支/重试）。
- 迁移脚本：每个 primary session 生成一个 work 行。

### 3.3 状态枚举

| status | 含义 | 谁写入 |
|--------|------|--------|
| `active` / `running` | 正在执行 | Runtime |
| `waiting` | 等用户输入或批准 | Runtime |
| `blocked` | 策略拒绝或错误需人处理 | Runtime |
| `completed` | 正常结束 | Runtime / 用户归档前 |
| `failed` | 失败结束 | Runtime |
| `archived` | 用户归档 | 用户 |

旧数据默认：`completed` 或 `active`（若最后一轮未显式结束，可 `active`）。

### 3.4 Plan 结构（最小）

```json
{
  "steps": [
    { "id": "s1", "title": "Inspect repository", "status": "done" },
    { "id": "s2", "title": "Draft report", "status": "running" }
  ]
}
```

无计划的旧会话：`plan: []`，UI 退化为纯对话 Activity，**不强制**每条都有计划。

---

## 4. API / 协议迁移

### 4.1 保留（兼容）

- `POST /api/chat`、SSE 流式、鉴权、health
- 现有 session id 查询

实现上：chat 内部改为「写入 Work + Event + 跑 Agent」，对外可仍收 `sessionId`。

### 4.2 新增（目标契约）

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/api/works` | 列表（标题、status、updatedAt） |
| GET | `/api/works/:id` | 详情含 goal/plan |
| POST | `/api/works` | 用 intent 创建 |
| PATCH | `/api/works/:id` | 改 status/plan/title |
| GET | `/api/works/:id/events` | 机器可读事件 |
| POST | `/api/works/:id/steer` | 对齐现有 steer |
| POST | `/api/tools/approve` 等 | 显式批准 |

### 4.3 废弃节奏

| 阶段 | 策略 |
|------|------|
| 迁移期 | 旧 chat API 全部可用；文档标注「等价于对 Work 发言」 |
| 稳定后 | 文档主推 works；chat 保留为 thin wrapper |
| 不建议 | 突然删除 session API 导致 Web MVP 全挂 |

### 4.4 CLI

- 现有 `dev:cli -p` → 创建/复用 Work 再执行。
- 增加 `work list` / `work show`（名称随意，语义要有）。

满足：**无 GUI 可完成创建 → 执行 → 查事件**。

---

## 5. Runtime / Agent 循环迁移

### 5.1 不变

- 单 `HarnessRuntime`
- 工具管道、权限三级、PathJail、Hooks、MCP client
- Steer / followUp
- 子 Agent 预算与防递归

### 5.2 要改的挂钩点

1. **execute 入口**
   - 入参增加 `workId`（或 session≡work）。
   - 每一轮开始/结束写 event。

2. **ContextBuilder**
   - 可注入 `Work.goal`、`plan` 摘要（动态区）。
   - 不把整份 event 日志无裁剪塞进 prompt。

3. **工具结果**
   - 先入 event store，再投影进 messages/context。

4. **Modes**
   - 循环内 **不再依赖** 用户选的 Chat/Code 模式。
   - 若需行为差异：由 intent 分类或 skill 激活，写入 Work 元数据 `tags[]` 即可。

### 5.3 子 Agent

- 创建 child session 时 `kind=worker`，`parentWorkId=...`。
- 列表 API 默认 `kind=primary`。
- UI 不展示为与主 Work 平级的一堆「会话」。

---

## 6. UI / IA 迁移

### 6.1 信息架构对照

| 区域 | As-Is | To-Be |
|------|-------|-------|
| 顶栏 | 连接与模型信息 | 同左，可点开 Runtime 摘要 |
| 左 Rail 上 | + New session、Modes | + 新工作；**无必选 Modes** |
| 左 Rail 中 | Sessions 时间戳列表 | **Works**：标题 + 状态点 + 相对时间 |
| 左 Rail 下 | Memory / Settings | 保留 |
| 主区空闲 | 欢迎语 + chips | 保留「接手什么」；chips → 创建 Work |
| 主区有选中 | 易与空闲混淆的聊天流 | **Goal / Plan / Activity**；无选中才显示全局空闲 |
| 底栏 | Composer 发消息 | 对 **当前 Work** 的意图/纠偏 |
| 右栏 | Inspector 杂项 | **User** 当前步骤/依据/等待；**Dev** 事件/token |

### 6.2 文案迁移

| 旧 | 新 |
|----|-----|
| 会话 / Sessions | 工作 / Work |
| 新会话 | 新工作 / 开始一项工作 |
| 发送 | 发送（可保留）或「交给 Hachimi」 |
| 描述问题 | 描述目标 / 想完成什么 |
| Mode: Chat | 删除或改为「通用」且非必选 |

### 6.3 组件级

- `SessionList` → `WorkList`（数据源换 API，状态点组件复用）。
- `MessageList` → `ActivityTimeline`（message 气泡仍可用，工具/审批用统一 Activity 块）。
- `ModeSwitcher` → 移除或改为设置里的「默认能力偏好」（非每次任务必选）。
- 选中 Work 时 **禁止** 再渲染全局 Hello（绑定 bug 一并修）。

### 6.4 Web vs Desktop

- 同一套 Work API 与组件语义。
- Web Settings **子集**；Desktop 再叠加系统能力。
- 不要求迁移日 Web=Desktop 全量。

---

## 7. 分阶段迁移步骤（实施顺序）

### 阶段 M1 — 后端加厚（不改 UI 也能做）

1. Session 增加 title/status/kind。
2. 标题生成：首条用户消息截断；禁止纯时间戳作为唯一标题。
3. Event 追加写入 + 重启恢复。
4. `GET .../events`。

**验收：** 旧 UI 仍可用；CLI 可证明恢复与事件。

### 阶段 M2 — Work API

1. Work 与 Session 1:1 映射或独立表。
2. `GET/POST/PATCH /works`。
3. Chat API 内部绑定 Work。
4. Worker 过滤。

**验收：** 脚本只通过 works API 跑通一轮工具任务。

### 阶段 M3 — UI 语义切换

1. Rail 改为 Work 列表 + 状态。
2. 去掉 Modes 必选。
3. 主区 Goal/Plan/Activity；修选中绑定。
4. Inspector 分层。

**验收：** 截图心智为工作台；空闲与进行中两种主区明确。

### 阶段 M4 — 策略与生产默认

1. 批准 API + 事件。
2. Secret/CORS/通道策略实机。

### 阶段 M5 — 演化与上下文

1. F5 提案。
2. 工具结果裁剪与 eval 用例。

**不可颠倒：** 先 M3 大改 UI、后补事件 → 易做成假 Work（仅改名）。

---

## 8. 迁移期双轨与回滚

| 机制 | 说明 |
|------|------|
| 特性开关 | `feature.work_ui=true` 可关回 Session 文案（可选） |
| API 双轨 | chat 与 works 并存至少两个版本周期 |
| 数据回滚 | 事件只追加，不删 messages；最坏关闭 event 恢复路径 |
| 文档 | README 主路径改为 Work；旧 Session 名称标 deprecated |

---

## 9. 测试与验收清单

**数据**

- [ ] 旧 session 能打开
- [ ] 新 work 有非时间戳标题
- [ ] worker 不默认刷满列表
- [ ] 重启后 events 与对话连续

**API**

- [ ] 无 token 冷启动行为符合安全默认
- [ ] approve/deny 有事件
- [ ] CLI 不依赖浏览器完成 list/show/run

**UI**

- [ ] 无 Modes 必选
- [ ] 选中 Work ≠ 全局 Hello
- [ ] Plan 有则展示，无则纯 Activity
- [ ] User Inspector 不含强制 Raw trace

**产品语义**

- [ ] 文案「工作/目标/接手」一致
- [ ] 文档 ARCHITECTURE 含 Work/Event 一节

---

## 10. 明确不在本次迁移范围

- 删除 Message 存储、全面只存 event（可列为更远期）
- AI 动态生成整页 UI
- 多个并列「人格 Agent」Mode 墙
- Web 实现全部 Desktop 系统集成
- 开 Desktop 强制打开浏览器
- 无预算地把「整个 Hachimi」暴露为任意外部 Agent 的无限工具

---

## 11. 成功标准（迁移完成时）

1. **对用户：** 列表是「正在做的事」，中心是目标与进展，输入框是指挥与纠偏。
2. **对机器：** 事件可拉、可恢复、可审批。
3. **对架构：** 仍只有一个 HarnessRuntime；Web/Desktop/Telegram 仍是薄表面。
4. **对演进：** 具备接 F5（从完成的 Work 提技能提案）的数据基础。

---

## 12. 摘要公式

```text
As-Is:  Session → Messages → (背后才是 Agent)
To-Be:  Intent → Work → Events/Activities → (Agent Runtime) → UI 投影

迁移手法: 加厚 core 与 API → 再改 IA 与文案
兼容手法: Session 保留为容器；chat API 薄封装；旧数据回填或放行
```

按本文从 **M1 事件与标题 → M2 Work API → M3 UI** 推进，即可从现有设计迁到目标设计，而不必一次性翻写整个前端或丢弃已有 Harness 管道。
