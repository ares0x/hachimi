// packages/core/src/sandbox/sandbox.ts
import {
  DEFAULT_MAX_BUFFER_BYTES,
  DEFAULT_SENSITIVE_ENV_KEYS,
  DEFAULT_TOOL_TIMEOUT_MS,
  formatSandboxExceptionMessage,
  formatSandboxPathJailMessage,
  formatSandboxTimeoutMessage,
  formatSandboxTruncationMessage,
} from "@hachimi/shared";
import { PathJail } from "./path-jail.js";

export interface ISandboxOptions {
  /** 工具最大允许执行时长 (毫秒)，默认 30,000ms */
  timeoutMs?: number;
  /** 最大控制台/输出字符缓冲区上限，默认 1024 * 1024 (1MB) */
  maxBuffer?: number;
  /** 允许透传的环境变量 Key 列表 (为空或不指定则剥离绝大部分敏感 Key) */
  allowedEnvKeys?: string[];
  /** 工作区根目录 */
  workspaceRoot?: string;
  /** 执行模式: "process" | "docker" */
  mode?: "process" | "docker";
}

export class ToolSandbox {
  private defaultTimeoutMs: number;
  private defaultMaxBuffer: number;
  public readonly pathJail: PathJail;

  constructor(options: ISandboxOptions = {}) {
    this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    this.defaultMaxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER_BYTES;
    this.pathJail = new PathJail({ workspaceRoot: options.workspaceRoot });
  }

  /**
   * G1.1: 环境变量自动脱敏 (Environment Scrubbing)
   * 从 process.env 中过滤掉主进程敏感 API Key，防止工具脚本读取偷拿外泄
   */
  static scrubEnv(
    rawEnv: Record<string, string | undefined> = process.env,
    allowedKeys?: string[]
  ): Record<string, string> {
    const clean: Record<string, string> = {};
    const allowedSet = allowedKeys ? new Set(allowedKeys) : null;

    for (const [key, val] of Object.entries(rawEnv)) {
      if (val === undefined) continue;

      if (allowedSet) {
        if (allowedSet.has(key)) {
          clean[key] = val;
        }
      } else {
        if (!DEFAULT_SENSITIVE_ENV_KEYS.includes(key.toUpperCase())) {
          clean[key] = val;
        }
      }
    }

    return clean;
  }

  /**
   * 在隔离沙箱环境下安全执行工具函数
   */
  async executeToolInSandbox(
    toolName: string,
    executeFn: () => Promise<string>,
    options: ISandboxOptions & { args?: Record<string, unknown> } = {}
  ): Promise<string> {
    // 1. PathJail 工作区越界与敏感文件访问拦截 (PathJail 物理断点硬化)
    if (options.args) {
      const READ_ONLY_TOOLS = new Set([
        "read_file",
        "list_dir",
        "grep_search",
        "view_file",
        "find_files",
      ]);
      const isReadOnly = READ_ONLY_TOOLS.has(toolName);
      const pathArgKeys = ["path", "filepath", "targetfile", "file", "dir", "dest", "src"];
      for (const [key, val] of Object.entries(options.args)) {
        if (typeof val === "string") {
          const isPathKey = pathArgKeys.some((k) => key.toLowerCase().includes(k));
          const isPathValue = val.includes("/") || val.includes("\\") || val.startsWith("~");

          if (isPathKey || isPathValue) {
            try {
              this.pathJail.assertPathInJail(val, toolName, isReadOnly);
            } catch (err: any) {
              return formatSandboxPathJailMessage(toolName, err?.message || String(err));
            }
          }
        }
      }
    }

    // 2. 环境变量脱敏生效 (Env Scrubbing)
    const cleanEnv = ToolSandbox.scrubEnv(process.env, options.allowedEnvKeys);

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxBuffer = options.maxBuffer ?? this.defaultMaxBuffer;

    let timer: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<string>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(formatSandboxTimeoutMessage(toolName, timeoutMs)));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([executeFn(), timeoutPromise]);

      // 输出流 Cap / 尺寸截断保护
      if (result && result.length > maxBuffer) {
        const truncated = result.slice(0, maxBuffer);
        return `${truncated}\n\n${formatSandboxTruncationMessage(toolName, maxBuffer)}`;
      }

      return result;
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      return formatSandboxExceptionMessage(toolName, msg);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
