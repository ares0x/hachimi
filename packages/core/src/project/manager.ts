// packages/core/src/project/manager.ts

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { FileDirStore } from "@hachimi/storage";
import type { CreateProjectResult, Project, ProjectGitInfo, ProjectSummary } from "./types.js";

const execFileAsync = promisify(execFile);

/** 规范化目录路径：解析符号链接 + 绝对化；目录不存在时退回 resolve 结果 */
export function canonicalizeRoot(root: string): string {
  const abs = resolve(root);
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
}

/** 幂等项目 ID：由规范化工作区根路径哈希而来（同一目录永远映射同一项目） */
export function projectIdForRoot(root: string): string {
  const canonical = canonicalizeRoot(root);
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return `proj_${hash}`;
}

async function resolveGitInfo(root: string): Promise<ProjectGitInfo | undefined> {
  try {
    const { stdout: rootOut } = await execFileAsync(
      "git",
      ["-C", root, "rev-parse", "--show-toplevel"],
      { timeout: 2000, windowsHide: true }
    );
    const gitRoot = rootOut.trim();
    if (!gitRoot) return undefined;
    let branch: string | undefined;
    try {
      const { stdout: branchOut } = await execFileAsync(
        "git",
        ["-C", root, "branch", "--show-current"],
        { timeout: 2000, windowsHide: true }
      );
      branch = branchOut.trim() || undefined;
    } catch {
      /* detached HEAD / 非 git */
    }
    return { isRepo: true, root: gitRoot, branch };
  } catch {
    return undefined;
  }
}

/**
 * ProjectManager — 项目数据管理器。
 * 存储路径：{dataDir}/projects/{projectId}.json（与 works 同级，local-first，可随 bundle 导出）。
 */
export class ProjectManager {
  private readonly dir: string;
  private readonly store: FileDirStore;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "projects");
    this.store = new FileDirStore();
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  private filePath(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  get(id: string): Project | null {
    return this.store.read<Project>(this.filePath(id));
  }

  /** 按最近更新排序 */
  list(): Project[] {
    this.ensureDir();
    return this.store
      .list(this.dir)
      .map((f) => this.store.read<Project>(join(this.dir, f)))
      .filter((p): p is Project => !!p)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  findByRoot(root: string): Project | null {
    return this.get(projectIdForRoot(root));
  }

  /** 幂等导入：同一根路径永远复用同一项目（id = hash(canonicalRoot)） */
  async getOrCreateFromRoot(root: string): Promise<CreateProjectResult> {
    const canonical = canonicalizeRoot(root);
    const existing = this.findByRoot(canonical);
    if (existing) return { project: existing, created: false };

    const now = new Date().toISOString();
    const git = await resolveGitInfo(canonical);
    const project: Project = {
      id: projectIdForRoot(canonical),
      name: basename(canonical) || canonical,
      workspaceRoot: canonical,
      git,
      createdAt: now,
      updatedAt: now,
    };
    this.store.write(this.filePath(project.id), project);
    return { project, created: true };
  }

  update(
    id: string,
    patch: Partial<Pick<Project, "name" | "description" | "details" | "color" | "archivedAt">>
  ): Project | null {
    const project = this.get(id);
    if (!project) return null;
    Object.assign(project, patch);
    project.updatedAt = new Date().toISOString();
    this.store.write(this.filePath(id), project);
    return project;
  }

  delete(id: string): boolean {
    const file = this.filePath(id);
    const existed = existsSync(file);
    this.store.remove(file);
    return existed;
  }

  toSummary(project: Project, workCount = 0): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      workspaceRoot: project.workspaceRoot,
      git: project.git,
      description: project.description,
      color: project.color,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      archivedAt: project.archivedAt,
      workCount,
    };
  }
}
