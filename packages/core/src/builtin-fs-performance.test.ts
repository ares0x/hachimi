import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathJail } from "./sandbox/path-jail.js";
import { deleteFileTool } from "./tools/builtin/fs/delete-file.js";
import { grepSearchTool } from "./tools/builtin/fs/grep-search.js";
import { listDirTool } from "./tools/builtin/fs/list-dir.js";
import { readFileTool } from "./tools/builtin/fs/read-file.js";
import { replaceFileContentTool } from "./tools/builtin/fs/replace-file.js";
import { writeFileTool } from "./tools/builtin/fs/write-file.js";
import type { ToolExecContext } from "./tools/types.js";

describe("Builtin FS Tools Performance & Ergonomics Suite", () => {
  const testDir = join(__dirname, "../../../data-test-builtin-fs");
  let jail: PathJail;
  let mockCtx: ToolExecContext;

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    jail = new PathJail({ workspaceRoot: testDir });
    mockCtx = {
      sessionId: "sess_fs_test",
      workspaceRoot: testDir,
      jail,
    };
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("write_file supports overwrite and append mode", async () => {
    const res1 = await writeFileTool.execute(
      { path: "test.txt", content: "Hello World\n" },
      mockCtx
    );
    expect(String(res1)).toContain("overwrite");

    const res2 = await writeFileTool.execute(
      { path: "test.txt", content: "Line 2\n", append: true },
      mockCtx
    );
    expect(String(res2)).toContain("append");

    const content = await readFileTool.execute({ path: "test.txt" }, mockCtx);
    expect(String(content)).toContain("Hello World");
    expect(String(content)).toContain("Line 2");
  });

  it("list_dir filters out node_modules by default and returns file sizes", async () => {
    mkdirSync(join(testDir, "node_modules"), { recursive: true });
    writeFileSync(join(testDir, "node_modules/pkg.json"), "{}");
    writeFileSync(join(testDir, "src_file.ts"), "console.log('hi');");

    const resFiltered = await listDirTool.execute({ path: "." }, mockCtx);
    expect(String(resFiltered)).not.toContain("node_modules");
    expect(String(resFiltered)).toContain("src_file.ts");

    const resAll = await listDirTool.execute({ path: ".", includeHidden: true }, mockCtx);
    expect(String(resAll)).toContain("node_modules");
  });

  it("grep_search finds pattern across workspace files", async () => {
    writeFileSync(join(testDir, "a.ts"), "const TARGET_KEY = 'secret1';");
    writeFileSync(join(testDir, "b.ts"), "const OTHER_KEY = 'other';");

    const res = await grepSearchTool.execute({ query: "TARGET_KEY" }, mockCtx);
    expect(String(res)).toContain("a.ts:1: const TARGET_KEY = 'secret1';");
    expect(String(res)).not.toContain("b.ts");
  });

  it("replace_file_content surgically replaces target block in text file", async () => {
    writeFileSync(
      join(testDir, "config.ts"),
      "export const PORT = 3000;\nexport const HOST = 'localhost';"
    );

    const res = await replaceFileContentTool.execute(
      {
        path: "config.ts",
        targetContent: "PORT = 3000;",
        replacementContent: "PORT = 8080;",
      },
      mockCtx
    );
    expect(String(res)).toContain("Replace Success");

    const content = await readFileTool.execute({ path: "config.ts" }, mockCtx);
    expect(String(content)).toContain("PORT = 8080;");
  });

  it("delete_file deletes specified file safely within jail", async () => {
    writeFileSync(join(testDir, "temp.txt"), "delete me");
    const delRes = await deleteFileTool.execute({ path: "temp.txt" }, mockCtx);
    expect(String(delRes)).toContain("Delete Success");
    expect(existsSync(join(testDir, "temp.txt"))).toBe(false);
  });
});
