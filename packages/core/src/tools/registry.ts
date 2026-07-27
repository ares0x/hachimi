// packages/core/src/tools/registry.ts
import { CIRCUIT_BREAKER_MAX_FAILURES, formatCircuitBreakerOpenMessage } from "@hachimi/shared";
import type { HookRegistry } from "../extensions/hooks.js";
import { ToolSandbox } from "../sandbox/sandbox.js";
import type { ToolDefinition } from "../types/index.js";

export interface ToolExecuteOptions {
  confirm?: boolean;
  context?: any;
  hooks?: HookRegistry;
  sessionId?: string;
  workManager?: any;
  workId?: string;
  onToolApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    permission: string
  ) => Promise<boolean>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private sandbox: ToolSandbox = new ToolSandbox();
  private failureCounts: Map<string, number> = new Map();
  private maxConsecutiveFailures = CIRCUIT_BREAKER_MAX_FAILURES;

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** 重置某工具的熔断计数 */
  resetCircuitBreaker(name: string) {
    this.failureCounts.set(name, 0);
  }

  /** 重置所有工具的熔断计数（Session重置/新轮次调用） */
  resetAllCircuitBreakers() {
    this.failureCounts.clear();
  }

  /** 获取某工具连续失败次数 */
  getFailureCount(name: string): number {
    return this.failureCounts.get(name) || 0;
  }

  /** 记录工具失败与判断熔断 */
  private recordFailure(name: string) {
    const current = this.getFailureCount(name);
    this.failureCounts.set(name, current + 1);
  }

  /**
   * 统一工具执行管道 (5 步标准化流程 H2.2 / H2.3 / H2.5)
   * 1. 检查是否存在与参数基本有效性
   * 2. 检查熔断器 Circuit Breaker (H2.5)
   * 3. 权限检查三级对齐 (H2.3)
   * 4. 触发 PreToolCall Hook 拦截/修改参数 (H2.6)
   * 5. 全量沙箱防裸跑超时包裹 (H2.2) ➔ 结果规范化 ➔ PostToolCall Hook (H2.4/H2.6)
   */
  async execute(
    name: string,
    rawArgs: Record<string, unknown>,
    options?: ToolExecuteOptions
  ): Promise<string> {
    const startTime = Date.now();
    const tool = this.tools.get(name);
    if (!tool) {
      return `未知工具: ${name}`;
    }

    // 1. 熔断器检查 (H2.5)
    const currentFailures = this.getFailureCount(name);
    if (currentFailures >= this.maxConsecutiveFailures) {
      return formatCircuitBreakerOpenMessage(name, currentFailures);
    }

    // 2. 参数基本校验 (H2.2)
    let args = { ...rawArgs };
    if (tool.parameters?.required && Array.isArray(tool.parameters.required)) {
      const missingKeys = tool.parameters.required.filter(
        (key) => args[key] === undefined || args[key] === null
      );
      if (missingKeys.length > 0) {
        this.recordFailure(name);
        return `[参数校验错误] 工具 ${name} 缺失必填参数: ${missingKeys.join(", ")}`;
      }
    }

    // 3. 权限三级统一对齐 (H2.3: TUI/Daemon/Telegram 贯穿确认)
    const level = tool.permission ?? "safe";

    if (level === "needs_confirm" || level === "dangerous") {
      let isApproved = Boolean(options?.confirm);
      if (!isApproved && options?.onToolApproval) {
        try {
          isApproved = await options.onToolApproval(name, args, level);
        } catch {
          isApproved = false;
        }
      }
      if (!isApproved) {
        return `需要确认才能执行工具: ${name} (${level})。用户拒绝或未经授权。`;
      }
    }

    // 4. PreToolCall Hook 拦截/修改参数 (H2.6)
    if (options?.hooks) {
      const preResult = await options.hooks.runPreToolCall({
        toolName: name,
        args,
        sessionId: options.sessionId,
      });

      if (preResult.action === "block") {
        return preResult.reason || `[Hook 拦截] 工具 ${name} 被生命周期钩子阻止执行。`;
      }
      if (preResult.modifiedArgs) {
        args = { ...preResult.modifiedArgs };
      }
    }

    // 5. 全量沙箱防卡死超时包裹 (H2.2 核心硬化：所有权限层级均享受 30s 超时隔离，避免死锁挂起)
    const execCtx = options?.context || ({} as any);
    let rawResult = "";
    let success = true;

    try {
      rawResult = await this.sandbox.executeToolInSandbox(name, () => tool.execute(args, execCtx), {
        timeoutMs: 30000,
        args,
      });

      if (
        rawResult.startsWith("[沙箱拦截]") ||
        rawResult.startsWith("[沙箱熔断]") ||
        rawResult.startsWith("Error executing tool")
      ) {
        success = false;
      }
    } catch (err: any) {
      success = false;
      const message = err instanceof Error ? err.message : String(err);
      rawResult = `Error executing tool ${name}: ${message}`;
    }

    // 熔断与自我修复逻辑 (H2.5)
    if (success) {
      this.failureCounts.set(name, 0);
    } else {
      this.recordFailure(name);
    }

    // 6. PostToolCall Hook (H2.6)
    const durationMs = Date.now() - startTime;
    let finalResult = rawResult;

    if (options?.hooks) {
      const postResult = await options.hooks.runPostToolCall({
        toolName: name,
        args,
        result: rawResult,
        durationMs,
        success,
      });
      if (postResult.modifiedResult !== undefined) {
        finalResult = postResult.modifiedResult;
      }
    }

    return finalResult;
  }
}
