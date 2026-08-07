// packages/shared/src/errors.ts
import { i18n } from "./i18n/index.js";

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
      i18n().t("error.permission_denied", {
        toolName,
        reason: reason ? `: ${reason}` : "",
      }),
      "TOOL_REJECTED",
      403,
      { toolName, reason }
    );
  }
}

export class ToolTimeoutError extends HachimiError {
  constructor(toolName: string, timeoutMs: number) {
    super(i18n().t("error.tool_timeout", { toolName, timeoutMs }), "TOOL_TIMEOUT", 408, {
      toolName,
      timeoutMs,
    });
  }
}

export class CircuitBreakerError extends HachimiError {
  constructor(toolName: string, failureCount: number) {
    super(
      i18n().t("error.tool_circuit_broken", { toolName, failureCount }),
      "CIRCUIT_BREAKER_TRIPPED",
      429,
      { toolName, failureCount }
    );
  }
}
