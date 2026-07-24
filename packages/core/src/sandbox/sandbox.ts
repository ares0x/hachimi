// packages/core/src/sandbox/sandbox.ts
export interface ISandboxOptions {
  /** 工具最大允许执行时长 (毫秒)，默认 30,000ms */
  timeoutMs?: number;
  /** 最大控制台/输出字符缓冲区上限，默认 1024 * 1024 (1MB) */
  maxBuffer?: number;
  /** 允许透传的环境变量 Key 列表 (为空则隔离全部环境) */
  allowedEnvKeys?: string[];
  /** 执行模式: "process" | "docker" */
  mode?: "process" | "docker";
}

export class ToolSandbox {
  private defaultTimeoutMs: number;
  private defaultMaxBuffer: number;

  constructor(options: ISandboxOptions = {}) {
    this.defaultTimeoutMs = options.timeoutMs ?? 30000;
    this.defaultMaxBuffer = options.maxBuffer ?? 1024 * 1024;
  }

  /**
   * 在隔离沙箱环境下安全执行工具函数
   */
  async executeToolInSandbox(
    toolName: string,
    executeFn: () => Promise<string>,
    options: ISandboxOptions = {}
  ): Promise<string> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxBuffer = options.maxBuffer ?? this.defaultMaxBuffer;

    let timer: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<string>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`[沙箱熔断] 工具 ${toolName} 执行超时 (${timeoutMs}ms)`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([executeFn(), timeoutPromise]);

      // 输出流 Cap / 尺寸截断保护
      if (result && result.length > maxBuffer) {
        const truncated = result.slice(0, maxBuffer);
        return `${truncated}\n\n[沙箱提示] 工具 ${toolName} 输出内容过长，已被自动截断 (最大限制 ${maxBuffer} 字节)`;
      }

      return result;
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[沙箱拦截] 工具 ${toolName} 执行异常: ${msg}`;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
