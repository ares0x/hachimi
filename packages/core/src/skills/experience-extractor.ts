// packages/core/src/skills/experience-extractor.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { generateId, log } from "@hachimi/shared";
import type { SkillPackageLoader } from "../extensions/skill-package.js";
import type { SkillRegistry } from "./registry.js";

export interface SkillDraft {
  id: string;
  name: string;
  description: string;
  tags: string[];
  instructions: string;
  triggerCondition: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface TrajectoryTurn {
  userGoal: string;
  toolCalls: string[];
  hasUserCorrection: boolean;
  assistantResponse: string;
}

/**
 * F5: 轨迹压缩器 (TrajectoryCompressor)
 * 从最近 N 轮对话历史中提炼目标、工具序列与修正迹象
 */
export class TrajectoryCompressor {
  private history: TrajectoryTurn[] = [];

  recordTurn(userGoal: string, toolCalls: string[], assistantResponse: string) {
    const isCorrection =
      userGoal.includes("不对") ||
      userGoal.includes("修改一下") ||
      userGoal.includes("重新") ||
      userGoal.includes("修正");

    this.history.push({
      userGoal,
      toolCalls,
      hasUserCorrection: isCorrection,
      assistantResponse,
    });

    if (this.history.length > 20) {
      this.history.shift();
    }
  }

  getHistory(): TrajectoryTurn[] {
    return [...this.history];
  }

  /**
   * 检测重复模式与用户纠正迹象
   */
  detectPattern(): { matched: boolean; toolChain: string[]; reason: string } | null {
    if (this.history.length < 2) return null;

    const recent = this.history.slice(-3);
    const corrections = recent.filter((t) => t.hasUserCorrection).length;

    // 模式 A: 用户多次纠正
    if (corrections >= 2) {
      const toolChain = recent.flatMap((t) => t.toolCalls);
      return {
        matched: true,
        toolChain,
        reason: "检测到用户多次纠正交互，可提取最佳修正流程为技能",
      };
    }

    // 模式 B: 同工具链多次重复使用
    const toolChains = this.history.map((t) => t.toolCalls.join("->")).filter(Boolean);
    const counts: Record<string, number> = {};
    for (const chain of toolChains) {
      counts[chain] = (counts[chain] || 0) + 1;
      if (counts[chain] >= 2) {
        return {
          matched: true,
          toolChain: chain.split("->"),
          reason: `检测到工具链 [${chain}] 被重复高效使用 2 次以上`,
        };
      }
    }

    return null;
  }
}

/**
 * F5: 经验技能提案管理器 (SkillProposalManager)
 * 人在回路 (Human-in-the-Loop)：提案只有在用户显式 Accept 采纳后才落盘注册为真实技能！
 */
export class SkillProposalManager {
  private proposalsDir: string;
  private skillsTargetDir: string;

  constructor(
    dataDir = "data",
    private skillsRegistry?: SkillRegistry,
    private skillLoader?: SkillPackageLoader,
    skillsTargetDir?: string
  ) {
    this.proposalsDir = resolve(dataDir, "proposals");
    this.skillsTargetDir = skillsTargetDir || join(homedir(), ".hachimi", "skills");
    if (!existsSync(this.proposalsDir)) {
      mkdirSync(this.proposalsDir, { recursive: true });
    }
  }

  /**
   * 生成新的技能提案 (Draft)，保持 pending 状态
   */
  createProposal(
    name: string,
    description: string,
    instructions: string,
    triggerCondition: string
  ): SkillDraft {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const draft: SkillDraft = {
      id: generateId("prop_"),
      name: cleanName,
      description,
      tags: ["extracted", "user-proposed"],
      instructions,
      triggerCondition,
      status: "pending",
      createdAt: Date.now(),
    };

    const filePath = join(this.proposalsDir, `${draft.id}.json`);
    writeFileSync(filePath, JSON.stringify(draft, null, 2), "utf-8");

    log("info", `💡 [Skill Proposal Created] Draft: ${draft.name} (Id: ${draft.id})`, {
      description,
    });

    return draft;
  }

  /**
   * 列出提案清单
   */
  listProposals(statusFilter?: "pending" | "approved" | "rejected"): SkillDraft[] {
    if (!existsSync(this.proposalsDir)) return [];

    const files = readdirSync(this.proposalsDir);
    const drafts: SkillDraft[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = readFileSync(join(this.proposalsDir, file), "utf-8");
        const parsed = JSON.parse(raw) as SkillDraft;
        if (!statusFilter || parsed.status === statusFilter) {
          drafts.push(parsed);
        }
      } catch {
        /* ignore read error */
      }
    }

    return drafts.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 用户采纳提案 (Accept) ➔ 状态更名为 approved ➔ 落盘 ~/.hachimi/skills/<name>/SKILL.md ➔ 注入 SkillRegistry
   */
  acceptProposal(id: string): { success: boolean; message: string; skillPath?: string } {
    const drafts = this.listProposals();
    const draft = drafts.find((d) => d.id === id);

    if (!draft) {
      return { success: false, message: `未找到 ID 为 ${id} 的技能提案` };
    }

    draft.status = "approved";
    writeFileSync(
      join(this.proposalsDir, `${draft.id}.json`),
      JSON.stringify(draft, null, 2),
      "utf-8"
    );

    // 物理落盘至 skillsTargetDir/<skill-name>/SKILL.md
    const targetDir = join(this.skillsTargetDir, draft.name);
    mkdirSync(targetDir, { recursive: true });

    const mdContent = `---
name: ${draft.name}
description: ${draft.description}
tags: [extracted, user-approved]
---

# ${draft.name}

${draft.instructions}
`;

    const skillMdPath = join(targetDir, "SKILL.md");
    writeFileSync(skillMdPath, mdContent, "utf-8");

    // 动态注册到全局技能表中
    if (this.skillsRegistry) {
      this.skillsRegistry.register({
        name: draft.name,
        description: draft.description,
        tags: draft.tags,
        load: () => ({ instructions: draft.instructions }),
      });
    }

    log(
      "info",
      `🎉 [Skill Proposal Accepted] Skill '${draft.name}' is now active at ${skillMdPath}`
    );

    return {
      success: true,
      message: `已成功采纳技能提案 '${draft.name}' 并落盘注册！`,
      skillPath: skillMdPath,
    };
  }

  /**
   * 用户拒绝提案 (Reject)
   */
  rejectProposal(id: string): { success: boolean; message: string } {
    const drafts = this.listProposals();
    const draft = drafts.find((d) => d.id === id);

    if (!draft) {
      return { success: false, message: `未找到 ID 为 ${id} 的技能提案` };
    }

    draft.status = "rejected";
    writeFileSync(
      join(this.proposalsDir, `${draft.id}.json`),
      JSON.stringify(draft, null, 2),
      "utf-8"
    );

    log("info", `🗑️ [Skill Proposal Rejected] Proposal '${draft.name}' rejected by user`);
    return { success: true, message: `已拒绝技能提案 '${draft.name}'` };
  }
}
