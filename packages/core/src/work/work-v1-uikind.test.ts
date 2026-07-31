import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkManager } from "./work-manager.js";

describe("V1.1 Work Metadata: uiKind + workspaceRoot Suite", () => {
  const testDir = join(process.cwd(), "data-test-v1-uikind");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("defaults single sentence chat prompt to uiKind: conversation", () => {
    const wm = new WorkManager(testDir);
    const work = wm.create({ intent: "你好，请自我介绍一下" });

    expect(work.uiKind).toBe("conversation");
    expect(work.goal).toBeUndefined();
  });

  it("defaults workspaceRoot prompts to uiKind: project", () => {
    const wm = new WorkManager(testDir);
    const work = wm.create({
      intent: "分析架构",
      workspaceRoot: "/Users/jace/workspace/Code/Node/Personal/hachimi",
    });

    expect(work.uiKind).toBe("project");
    expect(work.workspaceRoot).toBe("/Users/jace/workspace/Code/Node/Personal/hachimi");
  });

  it("migrates legacy works without uiKind field seamlessly", () => {
    const wm = new WorkManager(testDir);
    const work = wm.create({ intent: "查看文件" });

    // Simulate legacy storage without uiKind
    delete (work as any).uiKind;
    wm.update(work.id, { title: "更新标题" });

    const read = wm.get(work.id);
    expect(read).not.toBeNull();
    expect(read?.uiKind).toBe("conversation");
  });
});
