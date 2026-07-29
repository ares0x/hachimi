// packages/shared/src/constants/messages.ts
/**
 * Hachimi Unified User-Facing Status, Rejection, Exception, and Interception Message Templates
 * Uses the i18n module for locale-aware messages. Default locale is "en".
 */
import { i18n } from "../i18n/index.js";

/** User rejection message template */
export function formatUserRejectionMessage(toolName: string): string {
  return i18n().t("tool.rejected_by_user", { toolName });
}

/** Sandbox tool execution timeout message template */
export function formatSandboxTimeoutMessage(toolName: string, timeoutMs: number): string {
  return i18n().t("tool.sandbox_timeout", { toolName, timeoutMs });
}

/** Sandbox output buffer cap truncation prompt message template */
export function formatSandboxTruncationMessage(toolName: string, maxBuffer: number): string {
  return i18n().t("tool.sandbox_truncated", { toolName, maxBuffer });
}

/** Sandbox tool execution exception message template */
export function formatSandboxExceptionMessage(toolName: string, msg: string): string {
  return i18n().t("tool.sandbox_error", { toolName, msg });
}

/** Sandbox PathJail out-of-bounds path validation failure message template */
export function formatSandboxPathJailMessage(toolName: string, reason: string): string {
  return i18n().t("tool.path_security_fail", { toolName, reason });
}

/** Circuit Breaker tool consecutive failure trip message template */
export function formatCircuitBreakerOpenMessage(toolName: string, failures: number): string {
  return i18n().t("tool.circuit_breaker", { toolName, failures });
}

/** Sub-Agent recursion delegation block message template */
export function formatSubAgentRecursionBlockedMessage(): string {
  return i18n().t("agent.no_recursive_dispatch");
}

/** Sub-Agent max turn limit reach message template */
export function formatSubAgentTurnLimitMessage(maxRounds: number): string {
  return i18n().t("agent.max_steps_reached", { maxRounds });
}

/** Sub-Agent async task dispatch success message template */
export function formatSubAgentAsyncDispatchedMessage(taskId: string): string {
  return i18n().t("agent.subagent_dispatched", { taskId });
}

/** Sub-Agent task completion summary header message template */
export function formatSubAgentSuccessSummaryMessage(taskId: string, output: string): string {
  return i18n().t("agent.subagent_completed", { taskId, output });
}
