// packages/core/src/tools/builtin/fs/diff.test.ts
import { describe, expect, it } from "vitest";
import { generateFileDiff } from "./diff.js";

describe("generateFileDiff Unified Diff Generator", () => {
  it("generates correct unified diff for new file creation (oldContent = null)", () => {
    const diff = generateFileDiff(
      "src/index.ts",
      null,
      "console.log('hello');\nconsole.log('world');"
    );
    expect(diff).toContain("--- /dev/null");
    expect(diff).toContain("+++ b/src/index.ts");
    expect(diff).toContain("+console.log('hello');");
    expect(diff).toContain("+console.log('world');");
  });

  it("returns no changes string when old and new contents match", () => {
    const diff = generateFileDiff("src/index.ts", "const x = 1;", "const x = 1;");
    expect(diff).toBe("(未发生任何更改)");
  });

  it("generates structured diff with context for line replacements", () => {
    const oldContent = "line 1\nline 2\nline 3\nline 4\nline 5";
    const newContent = "line 1\nline 2\nline 3 modified\nline 4\nline 5";

    const diff = generateFileDiff("test.txt", oldContent, newContent);
    expect(diff).toContain("--- a/test.txt");
    expect(diff).toContain("+++ b/test.txt");
    expect(diff).toContain("-line 3");
    expect(diff).toContain("+line 3 modified");
  });
});
