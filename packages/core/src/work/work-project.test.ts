// packages/core/src/work/work-project.test.ts
/**
 * V1.2: Work ↔ Project 关联（projectId 派生 / 迁移 / 解绑）
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectIdForRoot } from "../project/manager.js";
import { WorkManager } from "./work-manager.js";

let tmpDir: string;
let wm: WorkManager;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "hachimi-work-proj-test-"));
  wm = new WorkManager(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("V1.2 Work.projectId", () => {
  it("create with workspaceRoot derives deterministic projectId", () => {
    const root = "/Users/jace/workspace/Code/Node/Personal/hachimi";
    const work = wm.create({ intent: "分析架构", workspaceRoot: root });
    expect(work.uiKind).toBe("project");
    expect(work.projectId).toBe(projectIdForRoot(root));
  });

  it("create with explicit projectId wins over derived one", () => {
    const work = wm.create({
      intent: "项目内任务",
      workspaceRoot: "/some/root",
      projectId: "proj_explicit",
    });
    expect(work.projectId).toBe("proj_explicit");
  });

  it("legacy work json without projectId is migrated on read", () => {
    const root = "/tmp/some-legacy-project";
    const work = wm.create({ intent: "旧项目", workspaceRoot: root });
    // 模拟旧版本存储：无 projectId
    const file = join(tmpDir, "works", `${work.id}.json`);
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    delete raw.projectId;
    writeFileSync(file, JSON.stringify(raw, null, 2), "utf-8");

    const read = wm.get(work.id);
    expect(read?.projectId).toBe(projectIdForRoot(root));
  });

  it("update with workspaceRoot forces uiKind=project and derives projectId", () => {
    const work = wm.create({ intent: "普通对话", uiKind: "conversation" });
    const updated = wm.update(work.id, { workspaceRoot: "/tmp/x" });
    expect(updated?.uiKind).toBe("project");
    expect(updated?.projectId).toBe(projectIdForRoot("/tmp/x"));
  });

  it("update clearing workspaceRoot unlinks projectId", () => {
    const root = "/tmp/proj-clear";
    const work = wm.create({ intent: "项目任务", workspaceRoot: root, uiKind: "task" });
    const updated = wm.update(work.id, { workspaceRoot: "", uiKind: "conversation" });
    expect(updated?.workspaceRoot).toBeUndefined();
    expect(updated?.projectId).toBeUndefined();
    expect(updated?.uiKind).toBe("conversation");
  });

  it("list() includes projectId in summaries", () => {
    const root = "/tmp/proj-list";
    wm.create({ intent: "项目任务 A", workspaceRoot: root, uiKind: "task" });
    wm.create({ intent: "普通对话" });
    const summaries = wm.list();
    const projectWork = summaries.find((w) => w.title === "项目任务 A");
    const convWork = summaries.find((w) => w.title === "普通对话");
    expect(projectWork?.projectId).toBe(projectIdForRoot(root));
    expect(convWork?.projectId).toBeUndefined();
  });
});
