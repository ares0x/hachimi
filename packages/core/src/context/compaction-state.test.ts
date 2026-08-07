// packages/core/src/context/compaction-state.test.ts
//
// P1.1 压缩后状态补偿：压缩块注入「执行状态快照」
// - 未完成计划步骤（pending/running）保留
// - 激活技能名保留
// - 已加载工具组保留
import { describe, expect, it } from "vitest";
import { ContextBuilder } from "./builder.js";

function makeHistory(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg_${i}`,
    role: "user" as const,
    content: "x".repeat(800),
    timestamp: Date.now() + i,
  }));
}

describe("P1.1 post-compaction state compensation", () => {
  it("compacted block re-injects plan / active skill / tool groups", async () => {
    const builder = new ContextBuilder();
    const history = makeHistory(14);

    const res = await builder.build({
      userInput: "test",
      history,
      workId: "w_state",
      activeSkill: "code-review",
      workManager: {
        get: () => ({
          plan: [
            { id: "s1", title: "分析代码", status: "done" },
            { id: "s2", title: "修复问题", status: "running", description: "修复 P1 缺陷" },
            { id: "s3", title: "写测试", status: "pending" },
          ],
        }),
      },
      tools: {
        list: () => [],
        get: () => undefined,
        getActivatedGroups: () => ["browser", "search"],
      } as any,
      options: { maxTokens: 1000, mode: "normal", enableTokenTruncation: false },
      tokenEstimator: () => 1_000_000,
    });

    expect(res.parts.historySummary).toContain("【执行状态快照（压缩时刻）】");
    // 已完成的步骤不保留，只保留未完成
    expect(res.parts.historySummary).toContain("[running] 修复问题");
    expect(res.parts.historySummary).toContain("[pending] 写测试");
    expect(res.parts.historySummary).not.toContain("[done]");
    expect(res.parts.historySummary).toContain("已激活技能: code-review");
    expect(res.parts.historySummary).toContain("已加载工具组: browser, search");
  });

  it("omits state snapshot when no state is available", async () => {
    const builder = new ContextBuilder();
    const history = makeHistory(14);

    const res = await builder.build({
      userInput: "test",
      history,
      workId: "w_nostate",
      options: { maxTokens: 1000, mode: "normal", enableTokenTruncation: false },
      tokenEstimator: () => 1_000_000,
    });

    expect(res.parts.historySummary).not.toContain("【执行状态快照（压缩时刻）】");
  });
});
