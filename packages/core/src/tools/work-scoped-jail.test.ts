import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Work } from "../types/work.js";
import { writeFileTool } from "./builtin/fs/write-file.js";
import { ToolRegistry } from "./registry.js";

describe("P0-5: Work-scoped workspaceRoot jail", () => {
  let workRoot: string;
  let outsideRoot: string;
  const workId = "work_scope_test";

  beforeAll(() => {
    workRoot = mkdtempSync(join(tmpdir(), "hachimi-work-"));
    outsideRoot = mkdtempSync(join(tmpdir(), "hachimi-outside-"));
  });

  afterAll(() => {
    rmSync(workRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  });

  const makeWork = (): Work =>
    ({
      id: workId,
      title: "scope test",
      uiKind: "project",
      workspaceRoot: workRoot,
      status: "active",
      plan: [],
      sessionIds: [workId],
      kind: "primary",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }) as Work;

  it("jails file tools to the Work workspaceRoot, not process.cwd()", async () => {
    const registry = new ToolRegistry();
    registry.register(writeFileTool);
    const work = makeWork();

    // 写入 Work 根目录内 → 允许
    const inside = await registry.execute(
      "write_file",
      { path: join(workRoot, "in.txt"), content: "x" },
      { channel: "tui", trustLevel: "full", work }
    );
    expect(inside).toContain("[Write Success]");
    expect(existsSync(join(workRoot, "in.txt"))).toBe(true);

    // 写入 Work 根目录外（即使位于进程 cwd 之外）→ 拦截
    const outside = await registry.execute(
      "write_file",
      { path: join(outsideRoot, "out.txt"), content: "x" },
      { channel: "tui", trustLevel: "full", work }
    );
    expect(outside).toContain("路径越界");
    expect(existsSync(join(outsideRoot, "out.txt"))).toBe(false);
  });

  it("falls back to registry default workspaceRoot when Work has none", async () => {
    const registry = new ToolRegistry();
    registry.register(writeFileTool);
    const work = { ...makeWork(), workspaceRoot: undefined };

    const outside = await registry.execute(
      "write_file",
      { path: join(workRoot, "no-root.txt"), content: "x" },
      { channel: "tui", trustLevel: "full", work }
    );
    // process.cwd() 内没有 workRoot，因此该写入应被默认 jail 拦截
    expect(outside).toContain("路径越界");
  });
});
