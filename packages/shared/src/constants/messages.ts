// packages/shared/src/constants/messages.ts
/**
 * Hachimi Unified User-Facing Status, Rejection, Exception, and Interception Message Templates
 */

/** User rejection message template */
export function formatUserRejectionMessage(toolName: string): string {
  return `[用户拦截] 工具 ${toolName} 的执行请求已被用户拒绝。`;
}

/** Sandbox tool execution timeout message template */
export function formatSandboxTimeoutMessage(toolName: string, timeoutMs: number): string {
  return `[沙箱熔断] 工具 ${toolName} 执行超时 (${timeoutMs}ms)`;
}

/** Sandbox output buffer cap truncation prompt message template */
export function formatSandboxTruncationMessage(toolName: string, maxBuffer: number): string {
  return `[沙箱提示] 工具 ${toolName} 输出内容过长，已被自动截断 (最大限制 ${maxBuffer} 字节)`;
}

/** Sandbox tool execution exception message template */
export function formatSandboxExceptionMessage(toolName: string, msg: string): string {
  return `[沙箱拦截] 工具 ${toolName} 执行异常: ${msg}`;
}

/** Sandbox PathJail out-of-bounds path validation failure message template */
export function formatSandboxPathJailMessage(toolName: string, reason: string): string {
  return `[沙箱拦截] 工具 ${toolName} 路径安全校验失败: ${reason}`;
}

/** Circuit Breaker tool consecutive failure trip message template */
export function formatCircuitBreakerOpenMessage(toolName: string, failures: number): string {
  return `[工具熔断] 工具 ${toolName} 已连续失败 ${failures} 次，已被自动熔断暂限执行。`;
}

/** Sub-Agent recursion delegation block message template */
export function formatSubAgentRecursionBlockedMessage(): string {
  return "[系统安全拦截] 子 Agent 禁止再次递归派发子任务，以防止无限嵌套死锁与递归爆炸。";
}

/** Sub-Agent max turn limit reach message template */
export function formatSubAgentTurnLimitMessage(maxRounds: number): string {
  return `[系统拦截] 子 Agent 已达到最大步数限制 (${maxRounds} 轮)，自动退出。`;
}

/** Sub-Agent async task dispatch success message template */
export function formatSubAgentAsyncDispatchedMessage(taskId: string): string {
  return `[异步派发成功] 子 Agent 任务已在后台启动 (TaskId: ${taskId})。你可以随时使用 \`check_subagent_status\` 查询进度。`;
}

/** Sub-Agent task completion summary header message template */
export function formatSubAgentSuccessSummaryMessage(taskId: string, output: string): string {
  return `[子 Agent 运行完成 (Task ID: ${taskId})]\n处理结果总结：\n${output}`;
}
