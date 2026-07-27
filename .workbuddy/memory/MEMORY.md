# Hachimi 项目长期记忆

## 架构核心理解
- 单脑 HarnessRuntime：TUI/CLI/Web/Telegram/子Agent/调度器共用一个 core 实例，daemon 模式由 apps/server 托管唯一实例
- 工具 5 步管道：熔断→参数校验→权限三级→PreHook→沙箱(30s/1MB)→PostHook，所有工具走 ToolRegistry.execute
- ContextBuilder 静态前缀 Identity→Skills→Tools 绝不动摇，动态区 时间→激活Skill→记忆→历史，尾部截断
- W0 事件真相源(FileEventStore JSONL append-only) → W1 Work 一等公民 → W2 权限矩阵(surface×toolClass)
- 当前 Phase W：W0-W2 完成，W3 UI 进行中，W4/W5/W6 未开始

## UI 三个表面状态（2026-07-27 核实）
- apps/web (React SPA, Work-first W3)：已用 WorkList 组件，含完整 sidebar 折叠（localStorage `hachimi_sidebar_collapsed` + ⌘B + w-14/w-[264px] + 折叠态图标轨道）
- apps/desktop (React SPA, 仍 Session-based 遗留)：用 Sidebar 组件，已补齐折叠功能（同 pattern）
- packages/channels/web/public (:3700 vanilla)：遗留 glassmorphism，DESIGN_SYSTEM §13 明确待整体重做、不扩展；当前 ⌘B 只做移动抽屉开关非轨道折叠
- 折叠 pattern 模板见 packages/ui/src/components/work-list.tsx 的 collapsed 分支

## 文档与代码一致性原则
- code + tests 是真相源，文档滞后以 code 为准
- ARCHITECTURE.md 缺「事件系统/Work 模型」一节是 W5.4 待办，非缺陷
- 用户/外部问题分析报告需逐条核实，常见失实：测试覆盖、配置别名、安全校验、单例设计
