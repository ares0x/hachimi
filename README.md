# hachimi

个人 AI 助理的 Harness 实现（TypeScript / Node）。

配合教程：[build-personal-ai-assistant](https://github.com/ares0x/build-personal-ai-assistant)
在线阅读：[https://ares0x.github.io/build-personal-ai-assistant/](https://ares0x.github.io/build-personal-ai-assistant/)

> **定位**：可运行、可演进的个人助理内核。
> `tutorial` 分支对应教学 L1 Demo；`main` 面向产品化地基与后续能力。

---

## 分支说明

| 分支 / Tag | 含义 |
|------------|------|
| `tutorial` | L1 教学冻结代码，与教程章节对应 |
| `main` | 产品演进（Phase A 及以后） |
| `phase-a-foundation` | Phase A 地基完成标记 |

---

## 当前能力（main / Phase A）

- Agent 循环 + 工具调用（含 calculator）
- 分层 Memory + 文件持久化
- Session 多轮历史持久化
- Skills 注册与简介注入（writing 等）
- 自然语言「请记住…」
- OpenAI / DeepSeek 兼容 Provider + MockLLM
- **Config 统一配置**（`@hachimi/config`）
- **Storage 接口**（`@hachimi/storage`，默认文件实现）
- **工具权限骨架**：`safe` / `needs_confirm` / `dangerous`
- **交互入口**：`apps/tui`（当前为稳定 readline Channel）
- **测试**：vitest（Memory / Session / Agent / 权限）

**明确延期**

- OpenTUI 全屏 TUI（Bun 下可用，但 iTerm 鼠标/OSC 残留问题未解决）
- Desktop / 完整多渠道

---

## 快速开始

### 环境

- Node.js ≥ 20
- pnpm ≥ 9

### 安装

```bash
pnpm install
```

### 配置（可选）
复制并编辑环境变量，或使用 config.json：

```bash
# 使用 DeepSeek
export LLM_PROVIDER=deepseek
export DEEPSEEK_API_KEY=sk-xxx

# 或使用 OpenAI
export LLM_PROVIDER=openai
export OPENAI_API_KEY=sk-xxx

# 不设置则使用 MockLLM
```

### 启动

```bash
pnpm dev:tui
```

### 测试

```bash
pnpm test
```

## 常用命令（TUI）

| 命令 | 说明 |
|------|------|
| `/help` | 帮助 |
| `/status` | 当前模型 / 会话 / 记忆状态 |
| `/memories` | 查看记忆 |
| `/remember <内容>` | 手动添加长期记忆 |
| `/sessions` | 列出历史会话 |
| `/clear session`| 清空当前会话消息 |
| `/exit` | 退出 |

也可以直接说：*请记住我喜欢喝手冲咖啡。*

## 项目结构

```text
hachimi/
├── apps/
│   └── tui/                 # 交互入口（readline Channel）
├── packages/
│   ├── core/                # Agent / Memory / Session / Skills / Tools
│   ├── config/              # 统一配置
│   ├── storage/             # 存储接口与文件实现
│   └── shared/              # generateId、logger 等
├── data/                    # 本地数据（gitignore，勿提交）
├── scripts/                 # 历史脚本（逐步迁移到 apps）
└── package.json
```
**原则**：`packages/core` 不依赖任何 UI；TUI 只通过 `createAppContext()` 组装运行时。

## 开发原则

1. **先地基，后能力** — Config / Storage / 测试 / 权限骨架优先于炫酷界面
2. **Core 与 Channel 分离** — 交互可替换，内核稳定
3. **tutorial 不乱改** — 教学路径与产品 main 分开演进
4. **取长补短** — 参考 Pi、Claude Code 分析、Grok Build、Hermes 的结构设计，不复制皮囊

## 路线图（简）

| 阶段 | 内容 | 状态 |
|------|------|------|
| L1 / tutorial | 最小可运行 Demo + 教程 | 完成 |
| Phase A | Config、Storage、入口、测试、权限骨架 | 完成 |
| Phase B | 上下文组装、Memory v2、Skills 按需加载 | 下一步 |
| Phase C | 第二通道（API / Telegram 等，非 Desktop）| 规划中 |

## 相关链接

- 教程仓库：[https://github.com/ares0x/build-personal-ai-assistant](https://github.com/ares0x/build-personal-ai-assistant)
- 本仓库：[https://github.com/ares0x/hachimi](https://github.com/ares0x/hachimi)
- 致谢：[bojieli/ai-agent-book](https://github.com/bojieli/ai-agent-book)

## License
MIT
