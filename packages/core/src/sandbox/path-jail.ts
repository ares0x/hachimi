// packages/core/src/sandbox/path-jail.ts
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { ToolRejectedError } from "@hachimi/shared";

export interface PathJailOptions {
  workspaceRoot?: string;
  knowledgeRoot?: string;
  knowledgeWriteRoot?: string;
  allowOutsideWorkspace?: boolean;
  allowOutsideRead?: boolean;
}

/**
 * G1.2 & H7.2: 工作区与多命名根路径狱防护类 (PathJail)
 * 支持多命名根并存与独立读写权限管理：
 * - workspaceRoot: 读写权限（代码工作区）
 * - knowledgeRoot: 只读权限（Second Brain / Obsidian vault）
 * - knowledgeWriteRoot: 仅允许写入特定 inbox 子目录（默认 knowledgeRoot/_inbox）
 */
export class PathJail {
  private workspaceRoot: string;
  private knowledgeRoot?: string;
  private knowledgeWriteRoot?: string;
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
    if (options.knowledgeRoot) {
      this.knowledgeRoot = resolve(options.knowledgeRoot);
      this.knowledgeWriteRoot = resolve(
        options.knowledgeWriteRoot || resolve(this.knowledgeRoot, "_inbox")
      );
    }
    this.allowOutsideWorkspace = options.allowOutsideWorkspace ?? false;
    this.allowOutsideRead = options.allowOutsideRead ?? true;
  }

  /** 解析路径在磁盘上的真实路径（跟随符号链接；不存在的部分取最近存在祖先） */
  private resolveRealPath(p: string): string {
    try {
      if (existsSync(p)) return realpathSync(p);
      let dir = dirname(p);
      const rest: string[] = [];
      while (dir && dir !== dirname(dir)) {
        if (existsSync(dir)) {
          const realDir = realpathSync(dir);
          return join(realDir, ...rest.reverse());
        }
        rest.push(basename(dir));
        dir = dirname(dir);
      }
    } catch {
      /* fall back to lexical */
    }
    return p;
  }

  /**
   * 校验并安全解析路径，支持针对 Work / Request 的 scopedWorkspaceRoot 与多命名根
   */
  assertPathInJail(
    targetPath: string,
    actionName = "访问文件",
    isReadOnly = false,
    scopedWorkspaceRoot?: string,
    scopedKnowledgeRoot?: string
  ): string {
    if (!targetPath) {
      throw new ToolRejectedError("targetPath", "路径不能为空");
    }

    let p = targetPath.trim();
    if (p.startsWith("~")) {
      p = p.replace(/^~/, homedir());
    }

    const currentWorkspace = scopedWorkspaceRoot
      ? resolve(scopedWorkspaceRoot)
      : this.workspaceRoot;
    const currentKnowledge = scopedKnowledgeRoot
      ? resolve(scopedKnowledgeRoot)
      : this.knowledgeRoot;
    const currentKnowledgeWrite = currentKnowledge
      ? resolve(this.knowledgeWriteRoot || resolve(currentKnowledge, "_inbox"))
      : undefined;

    const resolved = resolve(currentWorkspace, p);
    const normalizedWorkspace = normalize(currentWorkspace);
    const normalizedTarget = normalize(resolved);

    // 真实路径（跟随符号链接），防止工作区内 symlink 指向 /etc、~/.ssh 等越界逃逸
    const realTarget = this.resolveRealPath(normalizedTarget);
    const realWorkspace = this.resolveRealPath(normalizedWorkspace);
    const realKnowledge = currentKnowledge
      ? this.resolveRealPath(normalize(currentKnowledge))
      : undefined;
    const realKnowledgeWrite = currentKnowledgeWrite
      ? this.resolveRealPath(normalize(currentKnowledgeWrite))
      : undefined;

    // 1. 物理硬化：系统敏感路径一律无条件硬拦截（词法 + 真实路径双重校验）
    const isSensitive = PathJail.SENSITIVE_PREFIXES.some(
      (prefix) =>
        normalizedTarget === prefix ||
        normalizedTarget.startsWith(`${prefix}/`) ||
        normalizedTarget.startsWith(`${prefix}\\`) ||
        realTarget === prefix ||
        realTarget.startsWith(`${prefix}/`) ||
        realTarget.startsWith(`${prefix}\\`)
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

    const isInside = (target: string, root: string): boolean =>
      target === root || target.startsWith(`${root}/`) || target.startsWith(`${root}\\`);

    const lexicallyInsideWorkspace = isInside(normalizedTarget, normalizedWorkspace);

    // 2. 检查 target 是否在 workspaceRoot 目录下（词法与真实路径双重校验；
    //    realpath 校验用于拦截工作区内 symlink 指向工作区外的逃逸）
    if (lexicallyInsideWorkspace) {
      if (isInside(realTarget, realWorkspace)) {
        return normalizedTarget;
      }
      // 词法上在工作区内，但真实路径经符号链接逃逸到工作区外 → 硬拦截
      throw new ToolRejectedError(
        actionName,
        `[沙箱拦截: 路径越界保护] 企图通过符号链接逃逸访问 '${targetPath}' 被拒绝。`
      );
    }

    // 3. 检查 target 是否在 Second Brain (knowledgeRoot) 范围内
    if (currentKnowledge) {
      const normalizedKnowledge = normalize(currentKnowledge);
      const insideKnowledge =
        isInside(normalizedTarget, normalizedKnowledge) &&
        realKnowledge !== undefined &&
        isInside(realTarget, realKnowledge);

      if (insideKnowledge) {
        if (isReadOnly) {
          return normalizedTarget;
        }

        // 写操作只允许在 knowledgeWriteRoot (_inbox) 内部
        if (currentKnowledgeWrite) {
          const normalizedWrite = normalize(currentKnowledgeWrite);
          const insideWriteInbox =
            isInside(normalizedTarget, normalizedWrite) &&
            realKnowledgeWrite !== undefined &&
            isInside(realTarget, realKnowledgeWrite);

          if (insideWriteInbox) {
            return normalizedTarget;
          }
        }

        throw new ToolRejectedError(
          actionName,
          `[沙箱拦截: 知识库只读保护] 企图写操作第二大脑知识库 '${targetPath}' 被拒绝。写操作只能在 inbox 目录 '${currentKnowledgeWrite}' 内部执行。`
        );
      }

      // 词法上在知识库内，但真实路径逃逸到知识库外 → 硬拦截
      if (isInside(normalizedTarget, normalizedKnowledge)) {
        throw new ToolRejectedError(
          actionName,
          `[沙箱拦截: 路径越界保护] 企图通过符号链接逃逸访问 '${targetPath}' 被拒绝。`
        );
      }
    }

    // 4. 对只读工具（如 read_file, list_dir, grep_search），在非敏感路径且开启 allowOutsideRead 时允许安全读取
    if (isReadOnly && this.allowOutsideRead) {
      return normalizedTarget;
    }

    throw new ToolRejectedError(
      actionName,
      `[沙箱拦截: 路径越界保护] 企图写操作或越界访问 '${targetPath}' (不在工作区 '${currentWorkspace}' 内部) 被拒绝。`
    );
  }

  isPathInJail(
    targetPath: string,
    isReadOnly = false,
    scopedWorkspaceRoot?: string,
    scopedKnowledgeRoot?: string
  ): boolean {
    try {
      this.assertPathInJail(
        targetPath,
        "检查",
        isReadOnly,
        scopedWorkspaceRoot,
        scopedKnowledgeRoot
      );
      return true;
    } catch {
      return false;
    }
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  getKnowledgeRoot(): string | undefined {
    return this.knowledgeRoot;
  }

  getKnowledgeWriteRoot(): string | undefined {
    return this.knowledgeWriteRoot;
  }
}
