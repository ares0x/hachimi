// packages/core/src/tools/artifact-archive.test.ts
//
// P1.6 大工具结果归档：
// - 未超限结果原样保留（不归档）
// - 超限结果写盘 + 摘要 + ref；readArtifactFile 可完整水合
// - 路径穿越/非法 ref 被拒绝
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archiveToolResult, readArtifactFile } from "./artifact-archive.js";
import { createReadArtifactTool } from "./builtin/meta/read-artifact.js";
import { ToolRegistry } from "./registry.js";

describe("P1.6 tool-result archival + hydration", () => {
  it("keeps small results inline without archiving", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-art-"));
    const out = archiveToolResult({
      dataDir: dir,
      sessionId: "sess_1",
      toolCallId: "call_small",
      text: "ok",
    });
    expect(out.text).toBe("ok");
    expect(out.artifactRef).toBeUndefined();
  });

  it("archives oversized results and hydrates full content via readArtifactFile", () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-art-"));
    const big = "x".repeat(20000);
    const out = archiveToolResult({
      dataDir: dir,
      sessionId: "sess_1",
      toolCallId: "call_big",
      text: big,
    });

    expect(out.artifactRef).toBe("sess_1/call_big");
    expect(out.text).toContain("已归档");
    expect(out.text).toContain("ref=sess_1/call_big");
    expect(out.text.length).toBeLessThan(big.length);

    expect(readArtifactFile({ dataDir: dir, ref: "sess_1/call_big" })).toBe(big);
  });

  it("read_artifact tool resolves refs and rejects path traversal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-art-"));
    const registry = new ToolRegistry();
    registry.register(createReadArtifactTool(dir), "builtin");

    // 未归档 ref → 友好错误
    const missing = await registry.execute(
      "read_artifact",
      { ref: "sess_x/call_missing" },
      { confirm: true }
    );
    expect(missing).toContain("归档文件不存在");

    // 路径穿越 → 拒绝
    const traversal = await registry.execute(
      "read_artifact",
      { ref: "../../etc/passwd" },
      { confirm: true }
    );
    expect(traversal).toContain("非法引用");

    // 正常水合
    archiveToolResult({
      dataDir: dir,
      sessionId: "sess_h",
      toolCallId: "call_h",
      text: "full-content-".repeat(2000),
    });
    const ok = await registry.execute("read_artifact", { ref: "sess_h/call_h" }, { confirm: true });
    expect(ok).toContain("full-content-");
  });
});
