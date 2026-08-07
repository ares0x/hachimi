// packages/core/src/sandbox/sandbox.ts
import {
  DEFAULT_MAX_BUFFER_BYTES,
  DEFAULT_TOOL_TIMEOUT_MS,
  formatSandboxExceptionMessage,
  formatSandboxPathJailMessage,
  formatSandboxTimeoutMessage,
  formatSandboxTruncationMessage,
  isSensitiveEnvKey,
} from "@hachimi/shared";
import { PathJail } from "./path-jail.js";

export interface ISandboxOptions {
  /** 工具最大允许执行时长 (毫秒)，默认 30,000ms */
  timeoutMs?: number;
  /** 超时触发时的回调 — 用于中止底层执行（如 abort 嵌套 run 的信号），防止孤儿执行 */
  onTimeout?: () => void;
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
        if (!isSensitiveEnvKey(key)) {
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
    options: ISandboxOptions & { args?: Record<string, unknown>; workspaceRoot?: string } = {}
  ): Promise<string> {
    // 1. PathJail 工作区越界与敏感文件访问拦截 (PathJail 物理断点硬化)
    //    只对 path 类参数做路径校验，避免把 content 等普通字符串误判为路径。
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
        if (typeof val !== "string") continue;
        const isPathKey = pathArgKeys.some((k) => key.toLowerCase().includes(k));
        if (!isPathKey) continue;

        try {
          this.pathJail.assertPathInJail(val, toolName, isReadOnly, options.workspaceRoot);
        } catch (err: any) {
          return formatSandboxPathJailMessage(toolName, err?.message || String(err));
        }
      }

      // 命令类参数（run_command 等）提取其中的绝对/家目录路径 token，
      // 硬拦截系统敏感目录引用（如 cat /etc/hosts、ls ~/.ssh），不误伤工作区内部路径。
      const commandVal = options.args.command;
      if (typeof commandVal === "string" && commandVal.includes("/")) {
        for (const token of extractShellPathTokens(commandVal)) {
          try {
            this.pathJail.assertPathInJail(token, toolName, true, options.workspaceRoot);
          } catch (err: any) {
            return formatSandboxPathJailMessage(toolName, err?.message || String(err));
          }
        }
      }
    }

    // 2. 环境变量脱敏生效 (Env Scrubbing) — 实际注入见 ToolRegistry.buildExecContext 的 ctx.env
    //    工具派生子进程时使用 ctx.env，避免敏感凭据透传。

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxBuffer = options.maxBuffer ?? this.defaultMaxBuffer;

    let timer: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<string>((_, reject) => {
      timer = setTimeout(() => {
        // 先拒绝外层（模型收到确定性超时错误），再通知中止底层执行，
        // 避免执行函数同步抛错导致竞态结果不稳定。
        reject(new Error(formatSandboxTimeoutMessage(toolName, timeoutMs)));
        options.onTimeout?.();
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

/**
 * 从 shell 命令字符串中提取绝对路径 / 家目录路径 token（忽略引号包裹的变量形态，
 * 变量展开的危险删除由 shell-ast-guard 负责拦截）。
 */
function extractShellPathTokens(command: string): string[] {
  const tokens: string[] = [];
  const re = /(?:^|[\s;|&()<>])(["']?)((\/[^\s"'|&;()<>]*|~\/[^\s"'|&;()<>]*))\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) {
    const path = m[2];
    if (path.startsWith("/") || path.startsWith("~/")) {
      tokens.push(path);
    }
  }
  return tokens;
}
