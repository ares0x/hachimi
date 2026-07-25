// packages/shared/src/constants/prompts.ts
/**
 * Hachimi 核心 Agent System Prompts 与身份描述文本模板
 */

/** 主助理 Agent 核心系统身份 Prompt */
export const MASTER_AGENT_SYSTEM_PROMPT = "你是 hachimi，一个个人 AI 助理。";

/** 子 Agent (Worker) 专职独立隔离任务提示词模板函数 */
export function formatSubAgentWorkerPrompt(task: string): string {
  return `【专职 Worker 子 Agent 独立隔离任务】
你是一个专职子任务处理工 Agent。请聚焦于完成以下子任务并输出清晰结构化总结，不要继承主助理人设，不要尝试递归派发其他子任务：

子任务描述:
${task}`;
}

/** 上下文构建器中对于 SubAgent 工具调用的指导说明 Prompt */
export const SUBAGENT_RULE_PROMPT_BLOCK =
  "【子 Agent 派发指南】: 仅在遇到复杂技术调研、长代码分析等独立子任务场景下使用 `delegate_subagent`。不要在普通对话中频繁派发。";
