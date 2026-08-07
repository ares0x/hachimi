// packages/core/src/project/__tests__/project-manager.test.ts
/**
 * V1.2: ProjectManager — 项目实体（目录 → 幂等项目）单测
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalizeRoot, ProjectManager, projectIdForRoot } from "../manager.js";

let tmpDir: string;
let root: string;
let pm: ProjectManager;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "hachimi-proj-test-"));
  root = join(tmpDir, "my-app");
  mkdirSync(root, { recursive: true });
  pm = new ProjectManager(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("V1.2 ProjectManager", () => {
  it("getOrCreateFromRoot creates a project bound to canonical root", async () => {
    const { project, created } = await pm.getOrCreateFromRoot(root);
    expect(created).toBe(true);
    // macOS /var -> /private/var 符号链接：断言 canonical 结果
    expect(project.workspaceRoot).toBe(canonicalizeRoot(root));
    expect(project.name).toBe("my-app");
    expect(project.id).toBe(projectIdForRoot(root));
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();
  });

  it("same root is idempotent — returns existing project without duplicating", async () => {
    const first = await pm.getOrCreateFromRoot(root);
    const second = await pm.getOrCreateFromRoot(root);
    expect(second.created).toBe(false);
    expect(second.project.id).toBe(first.project.id);
    expect(pm.list()).toHaveLength(1);
  });

  it("trailing slash resolves to the same canonical project", async () => {
    const a = await pm.getOrCreateFromRoot(root);
    const b = await pm.getOrCreateFromRoot(`${root}/`);
    expect(b.project.id).toBe(a.project.id);
    expect(b.created).toBe(false);
  });

  it("list() returns projects sorted by updatedAt desc", async () => {
    const p1 = (await pm.getOrCreateFromRoot(root)).project;
    const root2 = join(tmpDir, "another");
    mkdirSync(root2, { recursive: true });
    const p2 = (await pm.getOrCreateFromRoot(root2)).project;
    // 更新 p1 使其 updatedAt 最新
    pm.update(p1.id, { description: "updated later" });
    const list = pm.list();
    expect(list.map((p) => p.id)).toEqual([p1.id, p2.id]);
  });

  it("update() patches metadata and bumps updatedAt", async () => {
    const { project } = await pm.getOrCreateFromRoot(root);
    const updated = pm.update(project.id, { name: "新名字", color: "#6366f1" });
    expect(updated?.name).toBe("新名字");
    expect(updated?.color).toBe("#6366f1");
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(project.updatedAt).getTime()
    );
  });

  it("delete() removes the project record", async () => {
    const { project } = await pm.getOrCreateFromRoot(root);
    expect(existsSync(join(tmpDir, "projects", `${project.id}.json`))).toBe(true);
    expect(pm.delete(project.id)).toBe(true);
    expect(pm.get(project.id)).toBeNull();
  });

  it("toSummary() carries workCount", async () => {
    const { project } = await pm.getOrCreateFromRoot(root);
    const summary = pm.toSummary(project, 3);
    expect(summary.workCount).toBe(3);
    expect(summary.name).toBe("my-app");
  });

  it("non-git directory yields no git metadata (does not throw)", async () => {
    const { project } = await pm.getOrCreateFromRoot(root);
    expect(project.git?.isRepo ?? false).toBe(false);
  });
});
