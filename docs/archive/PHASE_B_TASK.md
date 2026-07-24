# Archived Tasks: Phase B — 基础修补与 Tier 1 记忆演进 (Completed)

> **完成时间**: 2026-07-24  
> **关联文档**: [`ROADMAP.md`](../ROADMAP.md) | [`ARCHITECTURE.md`](../ARCHITECTURE.md) | [`PROJECT.md`](../PROJECT.md)

---

## 📌 Phase B 完成任务归档

### 1. B1 — 统一权限类型定义 (Unify Permission Types)
- [x] **B1.1**: 整理 `packages/core/src/types/index.ts` 中的 `PermissionLevel` 与 `ToolPermission`，统一为标准的 `ToolPermission = "safe" | "needs_confirm" | "dangerous"`。
- [x] **B1.2**: 更新 `ToolDefinition` 与 `ToolRegistry` 中的权限读取逻辑，移除未使用的冗余声明。
- [x] **B1.3**: 更新 `Agent` 工具循环与 TUI 拦截器的权限判定，确保类型安全。

### 2. B2 — 打造 Prompt-Cache 稳定的 `ContextBuilder`
- [x] **B2.1**: 重构 `ContextBuilder.build()` 布局，将固定静态内容（System Identity、Tools 定义、Skills 描述）排在最前作为缓存稳定前缀。
- [x] **B2.2**: 划分明确的动态边界，将变动内容（检索到的 Memory、活跃 Skill 详情、历史对话）至于前缀之后。
- [x] **B2.3**: 改进截断算法：取消中间随机抽掉 Block 的逻辑，替换为严格的 Tail-only (尾部截断) 与基于 Token Estimator 的精准截断。

### 3. B3 — 记忆检索 v2：接入 Embedding 向量检索 (Tier 1 Personalization)
- [x] **B3.1**: 在 `@hachimi/shared` 中提供轻量向量余弦相似度 `cosineSimilarity` 与文本归一化/重合度算法 `jaccardSimilarity`。
- [x] **B3.2**: 升级 `MemoryManager.search()`，支持混合打分算子（语义相似度 60% + 重要度 40%）。
- [x] **B3.3**: 保持 Working / Session / Long-term / Archival 四层层次化记忆模型契约不变。

### 4. B4 — 技能激活机制优化 (Skill Activation via Tool Call)
- [x] **B4.1**: 移除 `agent.ts` 中脆弱的正规表达式技能检测逻辑。
- [x] **B4.2**: 在 `SkillRegistry` 中引入系统工具 `activate_skill`，由大模型在阅读技能列表后根据意图显式调用激活。

### 5. B5 — 强化记忆巩固与整理循环 (Hardened Memory Consolidation)
- [x] **B5.1**: 增强 `MemoryManager.cleanup()` 中的 `deduplicate()`，基于文本归一化与高相似度打分完成近似重复合并。
- [x] **B5.2**: 引入时间衰减（Time-Decay）记忆剪枝 `prune()` 机制，按最后访问时间优雅调整历史权重。
