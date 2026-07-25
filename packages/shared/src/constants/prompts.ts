// packages/shared/src/constants/prompts.ts
/**
 * Hachimi Core Agent System Prompts & Identity Text Templates
 */

/** Master Assistant Agent Core System Identity Prompt */
export const MASTER_AGENT_SYSTEM_PROMPT = "You are Hachimi, a personal AI assistant.";

/** Sub-Agent (Worker) Isolated Dedicated Task System Prompt Template */
export function formatSubAgentWorkerPrompt(task: string): string {
  return `[Dedicated Worker Sub-Agent Task]
You are a dedicated sub-agent worker. Focus on completing the following sub-task and producing a structured summary. Do not inherit the master assistant persona, and do not attempt to recursively delegate further sub-tasks:

Task Description:
${task}`;
}

/** Guidance Prompt Block for Sub-Agent Delegation in ContextBuilder */
export const SUBAGENT_RULE_PROMPT_BLOCK =
  "[Sub-Agent Delegation Guide]: Use `delegate_subagent` only when encountering complex technical research, deep code analysis, or long-running tasks. Do not delegate routinely in normal conversations.";
