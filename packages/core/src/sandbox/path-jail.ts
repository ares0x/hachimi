// packages/core/src/sandbox/path-jail.ts
import { homedir } from "node:os";
import { isAbsolute, normalize, resolve } from "node:path";
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
    const isInsideWorkspace =
      normalizedTarget === normalizedWorkspace ||
      normalizedTarget.startsWith(`${normalizedWorkspace}/`) ||
      normalizedTarget.startsWith(`${normalizedWorkspace}\\`);

    if (isInsideWorkspace) {
      return normalizedTarget;
    }

    // 3. 检查 target 是否在 Second Brain (knowledgeRoot) 范围内
    if (currentKnowledge) {
      const normalizedKnowledge = normalize(currentKnowledge);
      const isInsideKnowledge =
        normalizedTarget === normalizedKnowledge ||
        normalizedTarget.startsWith(`${normalizedKnowledge}/`) ||
        normalizedTarget.startsWith(`${normalizedKnowledge}\\`);

      if (isInsideKnowledge) {
        if (isReadOnly) {
          return normalizedTarget;
        }

        // 写操作只允许在 knowledgeWriteRoot (_inbox) 内部
        if (currentKnowledgeWrite) {
          const normalizedWrite = normalize(currentKnowledgeWrite);
          const isInsideWriteInbox =
            normalizedTarget === normalizedWrite ||
            normalizedTarget.startsWith(`${normalizedWrite}/`) ||
            normalizedTarget.startsWith(`${normalizedWrite}\\`);

          if (isInsideWriteInbox) {
            return normalizedTarget;
          }
        }

        throw new ToolRejectedError(
          actionName,
          `[沙箱拦截: 知识库只读保护] 企图写操作第二大脑知识库 '${targetPath}' 被拒绝。写操作只能在 inbox 目录 '${currentKnowledgeWrite}' 内部执行。`
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
}
