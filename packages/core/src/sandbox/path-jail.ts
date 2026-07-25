// packages/core/src/sandbox/path-jail.ts
import { homedir } from "node:os";
import { isAbsolute, normalize, resolve } from "node:path";
import { ToolRejectedError } from "@hachimi/shared";

export interface PathJailOptions {
  workspaceRoot?: string;
  allowOutsideWorkspace?: boolean;
}

/**
 * G1.2: 工作区路径狱防护类 (PathJail)
 * 防止 Tool 越界读取/修改 workspace 外的宿主机敏感文件 (如 ~/.ssh, /etc/passwd)
 */
export class PathJail {
  private workspaceRoot: string;
  private allowOutsideWorkspace: boolean;

  constructor(options: PathJailOptions = {}) {
    this.workspaceRoot = resolve(options.workspaceRoot || process.cwd());
    this.allowOutsideWorkspace = options.allowOutsideWorkspace ?? false;
  }

  /**
   * 校验并安全解析路径，若企图越界且未开启 allowOutsideWorkspace 则拦截
   */
  assertPathInJail(targetPath: string, actionName = "访问文件"): string {
    if (!targetPath) {
      throw new ToolRejectedError("targetPath", "路径不能为空");
    }

    let p = targetPath.trim();
    if (p.startsWith("~")) {
      p = p.replace(/^~/, homedir());
    }

    const resolved = resolve(this.workspaceRoot, p);
    const normalizedWorkspace = normalize(this.workspaceRoot);
    const normalizedTarget = normalize(resolved);

    if (this.allowOutsideWorkspace) {
      return normalizedTarget;
    }

    // 检查 target 是否在 workspaceRoot 目录下 (包含子目录或精准匹配)
    const isInside =
      normalizedTarget === normalizedWorkspace ||
      normalizedTarget.startsWith(`${normalizedWorkspace}/`) ||
      normalizedTarget.startsWith(`${normalizedWorkspace}\\`);

    if (!isInside) {
      throw new ToolRejectedError(
        actionName,
        `[沙箱拦截: 路径越界保护] 尝试访问工作区以外敏感路径 '${targetPath}' (解析为 '${normalizedTarget}') 被拒绝。工作区根目录: '${normalizedWorkspace}'`
      );
    }

    return normalizedTarget;
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }
}
