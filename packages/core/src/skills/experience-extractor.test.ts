// packages/core/src/skills/experience-extractor.test.ts
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SkillRegistry } from "./registry.js";
import { SkillProposalManager, TrajectoryCompressor } from "./experience-extractor.js";

describe("F5 Experience Skill Extraction & Human-in-the-Loop Proposal Suite", () => {
  it("TrajectoryCompressor detects pattern and user correction", () => {
    const compressor = new TrajectoryCompressor();

    compressor.recordTurn("计算 1 + 1", ["calculator"], "结果为 2");
    compressor.recordTurn("计算 2 + 2", ["calculator"], "结果为 4");

    const pattern = compressor.detectPattern();
    expect(pattern).not.toBeNull();
    expect(pattern?.matched).toBe(true);
    expect(pattern?.reason).toContain("被重复高效使用");
  });

  it("SkillProposalManager creates pending draft and activates skill ONLY after user accepts proposal", () => {
    const testDataDir = "data/test_f5_proposals";
    const skillRegistry = new SkillRegistry();
    const manager = new SkillProposalManager(
      testDataDir,
      skillRegistry,
      undefined,
      join(testDataDir, "skills")
    );

    // 1. 生成提案 (Draft)，初始状态必须为 pending
    const draft = manager.createProposal(
      "auto_calc_summary",
      "自动执行计算并生成总结的技能",
      "调用 calculator 工具并将输出转换为简报",
      "当用户要求批量计算并汇报时"
    );

    expect(draft.status).toBe("pending");

    // 未接受前，技能表内不包含该技能
    expect(skillRegistry.get("auto_calc_summary")).toBeUndefined();

    // 2. 人在回路：用户采纳 (Accept) 提案
    const acceptRes = manager.acceptProposal(draft.id);
    expect(acceptRes.success).toBe(true);

    // 3. 验证已被转换为正式 Skill 注册到全局 CapabilitySource
    const activeSkill = skillRegistry.get("auto_calc_summary");
    expect(activeSkill).toBeDefined();
    expect(activeSkill?.name).toBe("auto_calc_summary");

    // 清理测试临时文件
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it("SkillProposalManager marks proposal as rejected when user rejects it", () => {
    const testDataDir = "data/test_f5_reject";
    const manager = new SkillProposalManager(testDataDir);

    const draft = manager.createProposal("rejected_skill", "被拒绝的技能草案", "无用指令", "条件");

    const rejectRes = manager.rejectProposal(draft.id);
    expect(rejectRes.success).toBe(true);

    const list = manager.listProposals("rejected");
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("rejected_skill");

    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });
});
