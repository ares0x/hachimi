# hachimi

个人 AI 助理的早期实验项目（Demo）。

本仓库当前 `tutorial` 分支对应教程：
> [build-personal-ai-assistant](https://github.com/ares0x/build-personal-ai-assistant)

**定位说明**：这是配合教程的可运行 Demo，用于讲解 Agent Harness 的核心设计思想，**不是生产级产品**。

## 当前已实现

- Agent 循环 + 工具调用
- 分层 Memory（含文件持久化）
- 自然语言记住
- Skills 系统（最小 Lazy 版）
- Session 管理（多轮对话持久化）
- OpenAI / DeepSeek 兼容的真实 LLM 接入
- 交互式 CLI

## 快速开始

```bash
pnpm install

# 配置环境变量（可选，不配置则使用 MockLLM）
export LLM_PROVIDER=deepseek
export DEEPSEEK_API_KEY=sk-xxx

# 启动 CLI
npx tsx scripts/chat.ts
```

## 特殊命令

在交互式 CLI 中，你可以使用以下特殊命令：

| 命令 | 说明 |
| --- | --- |
| `/memories` | 查看长期记忆 |
| `/remember <内容>` | 手动添加记忆 |
| `/sessions` | 列出历史会话 |
| `/clear session` | 清空当前会话 |
| `/exit` | 退出 |

## 项目结构

```text
.
├── apps/              # 应用层（如 server）
├── packages/          # 核心与共享包
│   ├── core/          # Agent、Memory、Session、Skills、Tools
│   ├── channels/      # 通道抽象（如 api、cli 等）
│   ├── shared/        # 公共工具
│   ├── storage/       # 存储实现
│   └── tools-builtin/ # 内置工具
├── scripts/           # 脚本（如交互式 CLI chat.ts 等）
└── data/              # 本地持久化数据（已 gitignore）
```

## 相关链接

- 教程仓库：[build-personal-ai-assistant](https://github.com/ares0x/build-personal-ai-assistant)
- 在线阅读：[https://ares0x.github.io/build-personal-ai-assistant/](https://ares0x.github.io/build-personal-ai-assistant/)
