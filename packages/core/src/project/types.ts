// packages/core/src/project/types.ts

/** 项目绑定工作区时的 Git 元信息（尽力解析，失败不阻塞） */
export interface ProjectGitInfo {
  isRepo: boolean;
  /** git root（来自 `git rev-parse --show-toplevel`，可能与工作区根不同） */
  root?: string;
  /** 当前分支（detached HEAD 或非 git 时无） */
  branch?: string;
}

/**
 * Project: 比 Work 更高层的集合实体。
 * 绑定一个本地工作区目录，承载项目级元数据与后续的项目记忆（MEMORY.md）。
 * Work 通过 `projectId` 归属到项目；一个项目可有多个 Work（1:N）。
 */
export interface Project {
  /** 幂等 ID：由规范化工作区根路径哈希而来（同一目录永远映射同一项目） */
  id: string;
  /** 人类可读名称（默认目录 basename，可重命名） */
  name: string;
  /** 规范化绝对路径 */
  workspaceRoot: string;
  /** Git 元信息（尽力解析） */
  git?: ProjectGitInfo;
  /** 一句话描述（列表/详情展示） */
  description?: string;
  /** 自由文本，后续注入 system prompt 作为项目上下文 */
  details?: string;
  /** 项目品牌色（可选，hex） */
  color?: string;
  /** 项目内 MEMORY.md 路径（可选，P2 启用） */
  memoryPath?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

/** 列表轻量返回（含项目下 Work 数量） */
export interface ProjectSummary {
  id: string;
  name: string;
  workspaceRoot: string;
  git?: ProjectGitInfo;
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  workCount: number;
}

export interface CreateProjectResult {
  project: Project;
  /** true = 本次新建；false = 已存在并复用 */
  created: boolean;
}
