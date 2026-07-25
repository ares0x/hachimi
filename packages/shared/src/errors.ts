// packages/shared/src/errors.ts

export class HachimiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, code = "HACHIMI_ERROR", status = 500, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ProviderError extends HachimiError {
  constructor(message: string, details?: unknown) {
    super(message, "PROVIDER_ERROR", 502, details);
  }
}

export class ToolRejectedError extends HachimiError {
  constructor(toolName: string, reason?: string) {
    super(
      `[用户/策略拒绝] 工具 ${toolName} 未获执行授权${reason ? `: ${reason}` : ""}`,
      "TOOL_REJECTED",
      403,
      { toolName, reason }
    );
  }
}

export class ToolTimeoutError extends HachimiError {
  constructor(toolName: string, timeoutMs: number) {
    super(`[沙箱/工具超时] 工具 ${toolName} 执行超时 (${timeoutMs}ms)`, "TOOL_TIMEOUT", 408, {
      toolName,
      timeoutMs,
    });
  }
}

export class CircuitBreakerError extends HachimiError {
  constructor(toolName: string, failureCount: number) {
    super(
      `[工具熔断] 工具 ${toolName} 已连续失败 ${failureCount} 次，已被自动暂停`,
      "CIRCUIT_BREAKER_TRIPPED",
      429,
      { toolName, failureCount }
    );
  }
}
