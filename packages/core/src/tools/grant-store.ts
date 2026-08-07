// packages/core/src/tools/grant-store.ts
// P0-4: 记忆授权存储（Grok Build remembered grants 模式）
//
// 用户在一次交互式审批中批准过的命令，按「项目工作区 + 命令前缀」记忆；
// 后续相同前缀的命令自动放行，避免重复打扰。
// 危险命令（rm/sudo/git push --force 等）永远复问，不写入记忆。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generateId } from "@hachimi/shared";

export interface RememberedGrant {
  id: string;
  workspaceRoot: string;
  toolName: string;
  /** 命令前缀（前 1-2 个 token，如 "npm run" / "git status"） */
  commandPrefix: string;
  grantedAt: number;
}

/** 提取命令前缀：取前两个 token；单 token 命令取一个 */
export function extractCommandPrefix(command: string): string {
  const tokens = command.trim().replace(/\s+/g, " ").split(" ");
  if (tokens.length === 0 || !tokens[0]) return "";
  return tokens.length >= 2 && tokens[1] ? `${tokens[0]} ${tokens[1]}` : tokens[0];
}

export class GrantStore {
  private filePath: string;
  private grants: RememberedGrant[] = [];

  constructor(filePath = "data/grants.json") {
    this.filePath = resolve(filePath);
    this.load();
  }

  private load(): void {
    try {
      if (!existsSync(this.filePath)) return;
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as { grants?: RememberedGrant[] };
      this.grants = Array.isArray(parsed.grants) ? parsed.grants : [];
    } catch {
      this.grants = [];
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify({ grants: this.grants }, null, 2), "utf-8");
  }

  list(workspaceRoot?: string): RememberedGrant[] {
    if (!workspaceRoot) return [...this.grants];
    return this.grants.filter((g) => g.workspaceRoot === workspaceRoot);
  }

  /** 查找匹配的命令记忆授权（前缀匹配） */
  find(
    workspaceRoot: string | undefined,
    toolName: string,
    command: string
  ): RememberedGrant | undefined {
    if (!workspaceRoot) return undefined;
    const normalized = command.trim().replace(/\s+/g, " ");
    return this.grants.find(
      (g) =>
        g.workspaceRoot === workspaceRoot &&
        g.toolName === toolName &&
        (normalized === g.commandPrefix || normalized.startsWith(`${g.commandPrefix} `))
    );
  }

  /** 记录一条记忆授权；返回 null 表示命令前缀为空（不记忆） */
  add(
    workspaceRoot: string | undefined,
    toolName: string,
    command: string
  ): RememberedGrant | null {
    if (!workspaceRoot) return null;
    const prefix = extractCommandPrefix(command);
    if (!prefix) return null;
    const existing = this.find(workspaceRoot, toolName, command);
    if (existing) return existing;

    const grant: RememberedGrant = {
      id: generateId("grant_"),
      workspaceRoot,
      toolName,
      commandPrefix: prefix,
      grantedAt: Date.now(),
    };
    this.grants.push(grant);
    this.save();
    return grant;
  }

  /** 移除指定项目的记忆授权（全部或按工具） */
  removeAll(workspaceRoot?: string, toolName?: string): number {
    const before = this.grants.length;
    this.grants = this.grants.filter(
      (g) =>
        (workspaceRoot && g.workspaceRoot !== workspaceRoot) ||
        (toolName && g.toolName !== toolName)
    );
    const removed = before - this.grants.length;
    if (removed > 0) this.save();
    return removed;
  }

  /** 按授权 id 精确移除单条记忆授权 */
  removeById(grantId: string): boolean {
    const before = this.grants.length;
    this.grants = this.grants.filter((g) => g.id !== grantId);
    const removed = before - this.grants.length;
    if (removed > 0) this.save();
    return removed > 0;
  }
}
