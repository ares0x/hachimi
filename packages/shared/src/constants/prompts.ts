// packages/shared/src/constants/prompts.ts
/**
 * Hachimi Core Agent System Prompts & Identity Text Templates
 */

/** Master Assistant Agent Core System Identity Prompt */
export const MASTER_AGENT_SYSTEM_PROMPT = "You are Hachimi, a personal AI assistant.";

/** P2: 子代理角色类型 — 决定能力面与工作提示（对齐 grok subagent_type / claude-code agent types） */
export type SubAgentType = "general-purpose" | "explore" | "plan" | "reviewer";

/** 各角色对子代理的行为指令（只读面同时由 allowedTools 硬性收窄） */
const SUBAGENT_ROLE_DIRECTIVES: Record<SubAgentType, string> = {
  "general-purpose":
    "You have full tool access. Complete the task and produce a structured summary.",
  explore:
    "You are a READ-ONLY codebase explorer: search, read, grep, and browse to gather facts. " +
    "You MUST NOT edit files, delete anything, run commands, or write memory. " +
    "Return a concise findings report with concrete file paths and evidence.",
  plan:
    "You are a READ-ONLY planning agent: explore the codebase and produce a structured, " +
    "step-by-step implementation plan (goals, files to change, risks, test strategy). " +
    "You MUST NOT edit files, delete anything, or run commands.",
  reviewer:
    "You are an adversarial READ-ONLY reviewer: verify claims against the actual code, " +
    "hunt for bugs, security issues, and regressions. You MUST NOT edit files or run commands. " +
    "Report findings with severity, file paths, and concrete evidence.",
};

/** Sub-Agent (Worker) Isolated Dedicated Task System Prompt Template */
export function formatSubAgentWorkerPrompt(
  task: string,
  subagentType: SubAgentType = "general-purpose"
): string {
  // 防御：模型可能传入 enum 之外的字符串（如 "explorer"），回退到默认角色
  const role = SUBAGENT_ROLE_DIRECTIVES[subagentType] ? subagentType : "general-purpose";
  return `[Dedicated Worker Sub-Agent Task (${subagentType})]
You are a dedicated sub-agent worker of type "${role}". Do not inherit the master assistant persona, and do not attempt to recursively delegate further sub-tasks.

Role constraints:
${SUBAGENT_ROLE_DIRECTIVES[role]}

Task Description:
${task}`;
}

/** Guidance Prompt Block for Sub-Agent Delegation in ContextBuilder */
export const SUBAGENT_RULE_PROMPT_BLOCK =
  "[Sub-Agent Delegation Guide]: Use `delegate_subagent` only when encountering complex technical research, deep code analysis, or long-running tasks. Do not delegate routinely in normal conversations.";
