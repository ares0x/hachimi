// packages/core/src/sandbox/path-jail.ts
import { homedir } from "node:os";
import { isAbsolute, normalize, resolve } from "node:path";
import { ToolRejectedError } from "@hachimi/shared";

export interface PathJailOptions {
  workspaceRoot?: string;
  allowOutsideWorkspace?: boolean;
  allowOutsideRead?: boolean;
}

/**
 * G1.2: 工作区路径狱防护类 (PathJail)
 * 防控 Tool 越界读取/修改 workspace 外的宿主机敏感文件 (如 ~/.ssh, /etc/passwd)
 * 对标 Claude Code / Cursor / Windsurf 架构：
 * - 系统敏感路径 (~/.ssh, ~/.aws, ~/.kube, /etc 等) 一律物理切断；
 * - 工作区内部完全放行；
 * - 针对非敏感的外部用户代码路径（如 ~/workspace/other-project），只读工具 (read_file, list_dir, grep_search) 允许安全读取，写入操作强拦截。
 */
export class PathJail {
  private workspaceRoot: string;
  private allowOutsideWorkspace: boolean;
  private allowOutsideRead: boolean;

  private static SENSITIVE_PREFIXES = [
    resolve(homedir(), ".ssh"),
    resolve(homedir(), ".aws"),
    resolve(homedir(), ".gnupg"),
    resolve(homedir(), ".kube"),
    "/etc",
    "/var/root",
    "/private/etc",
  ];

  constructor(options: PathJailOptions = {}) {
    this.workspaceRoot = resolve(options.workspaceRoot || process.cwd());
    this.allowOutsideWorkspace = options.allowOutsideWorkspace ?? false;
    this.allowOutsideRead = options.allowOutsideRead ?? true;
  }

  /**
   * 校验并安全解析路径，支持针对 Work / Request 的 scopedWorkspaceRoot
   */
  assertPathInJail(
    targetPath: string,
    actionName = "访问文件",
    isReadOnly = false,
    scopedWorkspaceRoot?: string
  ): string {
    if (!targetPath) {
      throw new ToolRejectedError("targetPath", "路径不能为空");
    }

    let p = targetPath.trim();
    if (p.startsWith("~")) {
      p = p.replace(/^~/, homedir());
    }

    const currentRoot = scopedWorkspaceRoot ? resolve(scopedWorkspaceRoot) : this.workspaceRoot;

    const resolved = resolve(currentRoot, p);
    const normalizedWorkspace = normalize(currentRoot);
    const normalizedTarget = normalize(resolved);

    // 1. 物理硬化：系统敏感路径一律无条件硬拦截
    const isSensitive = PathJail.SENSITIVE_PREFIXES.some(
      (prefix) =>
        normalizedTarget === prefix ||
        normalizedTarget.startsWith(`${prefix}/`) ||
        normalizedTarget.startsWith(`${prefix}\\`)
    );
    if (isSensitive) {
      throw new ToolRejectedError(
        actionName,
        `[沙箱拦截: 路径越界保护] 企图访问系统敏感目录 '${targetPath}' 被拒绝。`
      );
    }

    if (this.allowOutsideWorkspace) {
      return normalizedTarget;
    }

    // 2. 检查 target 是否在 workspaceRoot 目录下 (包含子目录或精准匹配)
    const isInside =
      normalizedTarget === normalizedWorkspace ||
      normalizedTarget.startsWith(`${normalizedWorkspace}/`) ||
      normalizedTarget.startsWith(`${normalizedWorkspace}\\`);

    if (isInside) {
      return normalizedTarget;
    }

    // 3. 对只读工具（如 read_file, list_dir, grep_search），在非敏感路径且开启 allowOutsideRead 时允许安全读取
    if (isReadOnly && this.allowOutsideRead) {
      return normalizedTarget;
    }

    throw new ToolRejectedError(
      actionName,
      `[沙箱拦截: 路径越界保护] 企图写操作或越界访问 '${targetPath}' (不在工作区 '${currentRoot}' 内部) 被拒绝。`
    );
  }

  isPathInJail(targetPath: string, isReadOnly = false, scopedWorkspaceRoot?: string): boolean {
    try {
      this.assertPathInJail(targetPath, "检查", isReadOnly, scopedWorkspaceRoot);
      return true;
    } catch {
      return false;
    }
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }
}
