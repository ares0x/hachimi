// packages/core/src/context/skill-budget.test.ts
//
// P2.4 技能上下文预算：
// - 激活技能指令超预算 → 降级为摘要 + 提示按需精读
// - 未超预算 → 完整指令保留
import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../skills/registry.js";
import { ContextBuilder, SKILL_BUDGET_PERCENT } from "./builder.js";

function makeSkill(instructions: string) {
  const reg = new SkillRegistry();
  reg.register({
    name: "big-skill",
    description: "测试大技能",
    permission: "safe",
    load: () => ({ instructions }),
  });
  return reg;
}

describe("P2.4 skill context budget", () => {
  it("downgrades oversized active skill instructions to a preview", async () => {
    const builder = new ContextBuilder();
    const big = `${"指令内容".repeat(2000)}TAIL_MARKER_SHOULD_BE_CUT`; // ~6000 chars
    const res = await builder.build({
      userInput: "x",
      skills: makeSkill(big),
      activeSkill: "big-skill",
      options: { maxTokens: 1000, mode: "normal", enableTokenTruncation: false },
      tokenEstimator: (text) => Math.ceil(text.length / 3),
    });
    expect(res.systemPrompt).toContain("已按上下文预算降级为摘要");
    expect(res.systemPrompt).toContain("activate_skill");
    // 完整指令尾部不再出现在上下文中（仅保留预览）
    expect(res.systemPrompt).not.toContain("TAIL_MARKER_SHOULD_BE_CUT");
  });

  it("keeps full instructions when within budget", async () => {
    const builder = new ContextBuilder();
    const small = "简短指令";
    const res = await builder.build({
      userInput: "x",
      skills: makeSkill(small),
      activeSkill: "big-skill",
      options: { maxTokens: 100000, mode: "normal", enableTokenTruncation: false },
      tokenEstimator: (text) => Math.ceil(text.length / 3),
    });
    expect(res.systemPrompt).toContain("简短指令");
    expect(res.systemPrompt).not.toContain("降级为摘要");
    expect(SKILL_BUDGET_PERCENT).toBe(0.1);
  });
});
