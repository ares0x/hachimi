// packages/shared/src/constants/messages.ts
/**
 * Hachimi 统一面向用户的状态、拒绝、异常与拦截提示文案模板函数
 */

/** 用户拦截/拒绝工具执行文案 */
export function formatUserRejectionMessage(toolName: string): string {
  return `[用户拦截] 工具 ${toolName} 的执行请求已被用户拒绝。`;
}

/** 沙箱工具超时熔断文案 */
export function formatSandboxTimeoutMessage(toolName: string, timeoutMs: number): string {
  return `[沙箱熔断] 工具 ${toolName} 执行超时 (${timeoutMs}ms)`;
}

/** 沙箱输出缓冲区上限截断提示文案 */
export function formatSandboxTruncationMessage(toolName: string, maxBuffer: number): string {
  return `[沙箱提示] 工具 ${toolName} 输出内容过长，已被自动截断 (最大限制 ${maxBuffer} 字节)`;
}

/** 沙箱工具执行异常文案 */
export function formatSandboxExceptionMessage(toolName: string, msg: string): string {
  return `[沙箱拦截] 工具 ${toolName} 执行异常: ${msg}`;
}

/** 沙箱 PathJail 路径越界校验失败文案 */
export function formatSandboxPathJailMessage(toolName: string, reason: string): string {
  return `[沙箱拦截] 工具 ${toolName} 路径安全校验失败: ${reason}`;
}

/** Circuit Breaker 工具连续失败熔断停用文案 */
export function formatCircuitBreakerOpenMessage(toolName: string, failures: number): string {
  return `[工具熔断] 工具 ${toolName} 已连续失败 ${failures} 次，已被自动熔断暂限执行。`;
}

/** 子 Agent 禁止递归派发拦截文案 */
export function formatSubAgentRecursionBlockedMessage(): string {
  return "[系统安全拦截] 子 Agent 禁止再次递归派发子任务，以防止无限嵌套死锁与递归爆炸。";
}

/** 子 Agent 达到最大轮次步数限制文案 */
export function formatSubAgentTurnLimitMessage(maxRounds: number): string {
  return `[系统拦截] 子 Agent 已达到最大步数限制 (${maxRounds} 轮)，自动退出。`;
}

/** 子 Agent 异步任务已派发提示文案 */
export function formatSubAgentAsyncDispatchedMessage(taskId: string): string {
  return `[异步派发成功] 子 Agent 任务已在后台启动 (TaskId: ${taskId})。你可以随时使用 \`check_subagent_status\` 查询进度。`;
}

/** 子 Agent 独立隔离任务完成总结头文本 */
export function formatSubAgentSuccessSummaryMessage(taskId: string, output: string): string {
  return `[子 Agent 运行完成 (Task ID: ${taskId})]\n处理结果总结：\n${output}`;
}
