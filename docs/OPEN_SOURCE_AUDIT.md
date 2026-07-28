# Hachimi 开源就绪度审计报告

> 审计日期：2026-07-28  
> 审计视角：以成熟开源项目标准（对标 Astro / Supabase / Ollama 级别）审视

---

## 一、总体评分

| 维度 | 当前状态 | 评分 |
|------|---------|------|
| 项目结构与 Monorepo 组织 | pnpm workspace，4 apps + 9 packages，清晰 | 8/10 |
| README & 文档国际化 | README 纯中文，docs 中英混杂 | 2/10 |
| 源码国际化（i18n） | 零 i18n 基础设施，1715 行中文 | 1/10 |
| 社区治理文件 | 缺 CONTRIBUTING / CoC / SECURITY / CHANGELOG | 1/10 |
| GitHub 基础设施 | 仅 ci.yml，缺 Issue 模板 / PR 模板 / Dependabot | 2/10 |
| CI/CD 完善度 | 仅 typecheck + test，缺 lint / build / coverage / release | 3/10 |
| 包元数据 | 根 package.json author/repo/bugs 缺失，license 与实际不符 | 3/10 |
| 测试覆盖 | 40 个测试文件，核心逻辑覆盖好，但无覆盖率报告 | 7/10 |
| .gitignore | 完善，50 行规则覆盖全面 | 9/10 |
| LICENSE | Apache-2.0 全文存在，但 package.json 写的 MIT | 4/10 |

**综合开源就绪度：约 30%** — 代码质量不错，但"包装"和"国际化"严重不足。

---

## 二、关键问题清单（按严重性排序）

### 🔴 P0 — 阻塞发布

#### 2.1 LICENSE 冲突

- `LICENSE` 文件是 **Apache-2.0**
- `package.json` 声明 `"license": "MIT"`
- 法律风险：用户不知道以哪个为准

**修复方案：** 统一为 Apache-2.0，修改 `package.json` 为 `"license": "Apache-2.0"`。

#### 2.2 README.md 纯中文

当前 README 189 行全部中文。全球开发者无法理解。

**修复方案：** 采用双语结构（对标 Rust / Bun 等项目的做法）：

```markdown
# Hachimi

**English** | [中文](README_CN.md)

> Local-first personal AI assistant harness...
```

具体结构：
- `README.md` — 英文版（主文件）
- `README_CN.md` — 中文版（保留，链接到主 README）
- 英文版应包含：Badge 条（CI / License / npm version）、一句话 Tagline、Feature Highlights、Quick Start、Architecture Overview（简版）、Contributing 指引链接、License

#### 2.3 缺失的社区治理文件

以下文件是 GitHub 开源项目的"标配"，缺一不可：

| 文件 | 作用 | 模板来源 |
|------|------|---------|
| `CONTRIBUTING.md` | 贡献指南：环境搭建、PR 流程、代码规范 | 参考 Astro / Vite |
| `CODE_OF_CONDUCT.md` | 行为准则 | Contributor Covenant v2.1（标准选择） |
| `SECURITY.md` | 安全漏洞报告流程 | 参考 Node.js / Supabase |
| `CHANGELOG.md` | 版本变更记录 | Keep a Changelog 格式 |

---

### 🟠 P1 — 严重国际化问题

#### 2.4 源码中 1715 行中文文本

这是最庞大的工作。按影响范围分类：

**A. 工具描述与错误消息（约 150+ 处）**

这些字符串会被注入 LLM system prompt 或直接返回给用户：

```
packages/core/src/tools/builtin/meta.ts
  L5:  description: "执行简单的加减乘除计算"
  L28: "错误：除数不能为 0"

packages/core/src/tools/builtin/shell/run-command.ts
  L32: "command 不能为空"
  L64: "(无输出)"
  L73: "[命令失败]"

packages/core/src/tools/builtin/fs/read-file.ts
  L102: "[文件不存在]"
  L106: "[不是文件]（若是目录请用 list_dir）"

packages/core/src/tools/builtin/fs/write-file.ts
  L26: "[写入成功]"

packages/core/src/tools/builtin/fs/delete-file.ts
  L25: "[删除成功]"

packages/core/src/tools/builtin/fs/list-dir.ts
  L26: "[目录不存在]"
```

```
packages/shared/src/constants/messages.ts — 所有熔断/拦截/超时消息
packages/shared/src/errors.ts — 所有错误类消息
packages/shared/src/tool-summary.ts — 所有工具摘要标签
```

**B. UI 组件（约 200+ 处）**

所有 React 组件中的标签、占位符、aria-label、按钮文本：

```
packages/ui/src/components/welcome-view.tsx    — 快速操作标题
packages/ui/src/components/work-list.tsx       — 状态标签、操作按钮
packages/ui/src/components/composer.tsx        — 输入框占位符
packages/ui/src/components/permission-dock.tsx — 权限弹窗文本
packages/ui/src/components/settings-panel.tsx  — 设置面板全部文本
packages/ui/src/components/command-palette.tsx — 命令面板标签
packages/ui/src/components/plan-tracker.tsx    — 计划跟踪器
packages/ui/src/components/activity-timeline.tsx — 活动时间线
packages/ui/src/components/context-panel.tsx   — 上下文面板
packages/ui/src/components/goal-panel.tsx      — 目标面板
```

**C. CLI 输出（约 50+ 处）**

```
packages/channels/cli/src/cli.ts
  L71-77:  STATUS_LABEL（进行中/等待中/阻塞中/已完成/已失败/已归档）
  L95-100: 相对时间（刚刚/分钟前/小时前/天前）
  L194-228: 活动标签（[用户]/[助理]/[工具]/[批准]/[拒绝]...）
```

**D. TUI 应用（约 30+ 处）**

```
apps/tui/src/ui/app.ts — 模型选择器描述
apps/tui/src/ui/commands.ts — 199 行中文命令描述
```

**E. Agent 核心逻辑（少量但关键）**

```
packages/core/src/agent/agent.ts
  L210: rememberPrefixes = ["请记住", "记住", "帮我记一下", "记一下"]
  L219: "好的，我已经记住了：..."
```

**F. 内置技能描述**

```
packages/core/src/skills/builtin/summary.ts — 总结助手
packages/core/src/skills/builtin/writing.ts — 写作助手
```

#### 2.5 i18n 改造方案

**推荐方案：轻量级 locale 字典 + 运行时 locale 参数**

不引入 react-intl / i18next 等重框架（过重，对 CLI/TUI 不友好），而是：

```
packages/shared/src/i18n/
├── index.ts          # createI18n(locale) 工厂
├── locales/
│   ├── en.ts         # 英文字典
│   └── zh-CN.ts      # 中文字典
└── types.ts          # 键名类型
```

**核心设计：**

```typescript
// packages/shared/src/i18n/index.ts
export type Locale = "en" | "zh-CN";

const dictionaries = {
  en: () => import("./locales/en"),
  "zh-CN": () => import("./locales/zh-CN"),
};

export function createI18n(locale: Locale = "en") {
  return {
    t(key: string, params?: Record<string, string>): string {
      // 查字典 + 插值
    }
  };
}
```

**分层改造顺序：**

1. **Phase A — 工具层（packages/shared + packages/core/tools）**  
   所有 tool description、error message、summary label 走 `i18n.t()`  
   默认 locale 为 `"en"`，中文作为可选 locale

2. **Phase B — UI 层（packages/ui）**  
   所有组件的 label / placeholder / aria-label 抽取到 `useI18n()` hook  
   通过 React Context 注入 locale

3. **Phase C — CLI/TUI 层**  
   CLI 根据 `process.env.LANG` 或 `--locale` flag 选择字典  
   TUI 在设置中提供语言切换

4. **Phase D — Agent 内置逻辑**  
   `rememberPrefixes` 改为 locale-aware  
   内置 skill description / instruction 按 locale 加载

---

### 🟡 P2 — GitHub 基础设施

#### 2.6 `.github/` 目录补全

```
.github/
├── ISSUE_TEMPLATE/
│   ├── bug_report.yml      # Bug 报告模板
│   ├── feature_request.yml  # 功能请求
│   └── config.yml           # 模板选择器配置
├── PULL_REQUEST_TEMPLATE.md  # PR 模板
├── FUNDING.yml               # 赞助链接（可选）
├── CODEOWNERS                # 代码所有者
├── dependabot.yml            # 依赖自动更新
└── workflows/
    ├── ci.yml                # 现有，需增强
    ├── release.yml           # 自动发布
    └── stale.yml             # 过期 Issue/PR 清理
```

**Issue 模板要点（bug_report.yml）：**

```yaml
name: Bug Report
description: Report a bug in Hachimi
body:
  - type: input
    attributes:
      label: Hachimi version
  - type: dropdown
    attributes:
      label: Channel
      options: [TUI, CLI, Web, Desktop, Telegram, API]
  - type: textarea
    attributes:
      label: Steps to reproduce
  - type: textarea
    attributes:
      label: Expected vs actual behavior
  - type: textarea
    attributes:
      label: Logs / screenshots
```

#### 2.7 CI/CD 增强

当前 `ci.yml` 仅做 typecheck + test。需补充：

```yaml
# 增强后的 CI pipeline
jobs:
  lint:
    - pnpm biome check .        # 或 eslint
  typecheck:
    - pnpm typecheck
  test:
    - pnpm test -- --coverage
    - upload coverage to Codecov
  build:
    - pnpm build                # 确保能构建
  smoke:
    - pnpm smoke:mock
  # 可选：
  # - Docker build test
  # - E2E (Playwright for web)
```

**Release 工作流（`release.yml`）：**

```yaml
# 基于 changesets 的自动发布
on:
  push:
    branches: [main]
jobs:
  release:
    - uses: changesets/action@v1
    - pnpm changeset publish
```

---

### 🟢 P3 — 包元数据与发布准备

#### 2.8 根 package.json 补全

```jsonc
{
  "name": "hachimi",
  "description": "Local-first personal AI assistant harness — TypeScript monorepo with TUI, CLI, Web, Desktop, Telegram, and API channels",
  "license": "Apache-2.0",  // 修复：从 MIT 改为 Apache-2.0
  "author": "Jace <jace@example.com>",  // 补全
  "homepage": "https://github.com/yourname/hachimi#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/yourname/hachimi.git"
  },
  "bugs": {
    "url": "https://github.com/yourname/hachimi/issues"
  },
  "keywords": ["ai-agent", "harness", "personal-assistant", "llm", "multi-channel", "typescript"],
  "engines": { "node": ">=20" }
}
```

#### 2.9 子包发布策略

当前所有 9 个子包标记 `"private": true`。需决策：

- **选项 A：** 保持 monorepo-only，不发布到 npm（适合初期）
- **选项 B：** 将 `@hachimi/core` 发布为独立 npm 包（适合生态扩展）

建议初期选 A，待 API 稳定后再考虑 B。

---

### 🔵 P4 — 文档体系优化

#### 2.10 docs/ 目录语言统一

当前状态：

| 文件 | 语言 | 建议 |
|------|------|------|
| ARCHITECTURE.md | ✅ English | 保持 |
| DESIGN_SYSTEM.md | ✅ English | 保持 |
| ROADMAP.md | ✅ English（1行中文） | 修复那 1 行 |
| REFACTOR_PLAN.md | ✅ English | 保持 |
| API.md | ❌ Chinese | 翻译为英文 |
| PROJECT.md | ❌ Chinese | 翻译为英文（PRD 对理解产品很关键） |
| TASK.md | ❌ Chinese | 翻译或改为英文 Issue 追踪 |
| PHASE.md | ❌ Chinese | 翻译为英文 |
| MOVE.md | ❌ Chinese | 翻译为英文 |

**建议：** 将所有规划文档迁移为英文。内部开发笔记（TASK.md）可以考虑用 GitHub Issues 替代。

#### 2.11 补充关键文档

| 文档 | 内容 |
|------|------|
| `docs/GETTING_STARTED.md` | 开发者快速上手：clone → install → run → 第一个 PR |
| `docs/DEVELOPMENT.md` | 开发指南：monorepo 结构、测试策略、调试技巧 |
| `docs/CHANNELS.md` | 各 Channel（TUI/CLI/Web/Desktop/Telegram/API）的使用与开发 |

---

### ⚪ P5 — 锦上添花

#### 2.12 其他建议

- **Logo / Banner：** `resources/` 已有 logo PNG，但 README 需要一个设计良好的 banner 图
- **Demo GIF / 截图：** 在 README 中放一个 TUI 或 Web UI 的录屏 GIF
- **Badges：** CI Status / License / npm version / Codecov / Discord
- **Dockerfile：** 提供一键部署 daemon 的能力
- **Examples 目录：** 展示典型使用场景（自定义 Tool、自定义 Skill、接入 Telegram）
- **API 文档生成：** 用 TypeDoc 从 TSDoc 自动生成 API 文档站点

---

## 三、推荐执行路线

### Phase 1：基础合规（1-2 天）

- [ ] 修复 LICENSE 冲突（package.json → Apache-2.0）
- [ ] 补全 package.json 元数据（author / repository / bugs / homepage）
- [ ] 创建英文 README.md + 中文 README_CN.md
- [ ] 添加 CONTRIBUTING.md（英文）
- [ ] 添加 CODE_OF_CONDUCT.md（Contributor Covenant）
- [ ] 添加 SECURITY.md（漏洞报告流程）
- [ ] 创建 CHANGELOG.md（Keep a Changelog 格式）
- [ ] 添加 GitHub Issue / PR 模板
- [ ] 添加 dependabot.yml

### Phase 2：CI/CD 增强（1 天）

- [ ] ci.yml 增加 lint + build 步骤
- [ ] 配置 Codecov 覆盖率上报
- [ ] 添加 release.yml（changesets 自动发布）
- [ ] 添加 stale.yml（过期 Issue 管理）

### Phase 3：i18n 基础设施（2-3 天）

- [ ] 创建 `packages/shared/src/i18n/` 模块
- [ ] 抽取工具层所有中文字符串到 locale 字典
- [ ] 抽取 UI 组件所有中文字符串到 locale 字典
- [ ] 抽取 CLI/TUI 所有中文字符串到 locale 字典
- [ ] 工具 description 改为 locale-aware
- [ ] 默认 locale 设为 `"en"`

### Phase 4：源码英文注释（1-2 天）

- [ ] 所有 JSDoc 注释翻译为英文
- [ ] 所有内联注释翻译为英文
- [ ] 保留中文注释仅在测试文件中（可接受）

### Phase 5：文档英文翻译（2-3 天）

- [ ] API.md → English
- [ ] PROJECT.md → English
- [ ] PHASE.md → English
- [ ] MOVE.md → English
- [ ] TASK.md → 迁移到 GitHub Issues
- [ ] 补充 GETTING_STARTED.md
- [ ] 补充 DEVELOPMENT.md

### Phase 6：发布准备（1 天）

- [ ] 设计 README banner 图
- [ ] 录制 Demo GIF
- [ ] 编写 Dockerfile
- [ ] 创建 examples/ 目录
- [ ] 配置 TypeDoc API 文档生成
- [ ] 首次公开 Release（v0.1.0-alpha）

---

## 四、工作量估算

| 阶段 | 预计工时 | 难度 |
|------|---------|------|
| Phase 1：基础合规 | 1-2 天 | 低 |
| Phase 2：CI/CD 增强 | 1 天 | 中 |
| Phase 3：i18n 基础设施 | 2-3 天 | 高（最大工作量） |
| Phase 4：注释翻译 | 1-2 天 | 中 |
| Phase 5：文档翻译 | 2-3 天 | 中 |
| Phase 6：发布准备 | 1 天 | 中 |
| **总计** | **8-12 天** | |

**最大瓶颈：** Phase 3 的 i18n 改造，涉及约 400+ 处字符串抽取，需要设计合理的 locale 架构避免破坏现有功能。

---

## 五、对标参考项目

以下开源项目在"项目呈现"方面做得很好，可直接参考：

| 项目 | 参考点 |
|------|--------|
| [Ollama](https://github.com/ollama/ollama) | AI 项目 README 结构、Demo GIF |
| [Astro](https://github.com/withastro/astro) | i18n 文档体系、Contributing 指南 |
| [Supabase](https://github.com/supabase/supabase) | 多语言 README、社区治理 |
| [Bun](https://github.com/oven-sh/bun) | 双语 README 结构 |
| [Continue](https://github.com/continuedev/continue) | AI 编码助手的开源呈现（同类项目） |

---

*本报告由审计工具自动生成，基于对项目 116 个源文件、40 个测试文件、15 个文档文件的完整扫描。*
