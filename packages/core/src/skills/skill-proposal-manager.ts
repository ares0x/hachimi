// packages/core/src/skills/skill-proposal-manager.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { generateId, log } from "@hachimi/shared";
import type { SkillPackageLoader } from "../extensions/skill-package.js";
import type { SkillRegistry } from "./registry.js";
import type { SkillProposalCandidate } from "./trajectory-compressor.js";

export interface SkillProposal {
  id: string;
  name: string;
  description: string;
  tags: string[];
  instructions: string;
  triggerCondition: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  sourceWorkId?: string;
  source?: "learned" | "builtin" | "external";
}

/**
 * W4.2 & W4.3: SkillProposalManager — 管理技能提案生命周期（人审确认机制）
 * 提案保存在 ~/.hachimi/proposals/ 中，未经过用户显式 accept 绝不自动载入 SkillRegistry。
 */
export class SkillProposalManager {
  private proposalsDir: string;
  private skillsTargetDir: string;

  constructor(
    dataDir = "data",
    private skillsRegistry?: SkillRegistry,
    private skillLoader?: SkillPackageLoader,
    skillsTargetDir?: string,
  ) {
    const defaultUserDir = join(homedir(), ".hachimi");
    this.proposalsDir = dataDir === "data" ? join(defaultUserDir, "proposals") : resolve(dataDir, "proposals");
    this.skillsTargetDir = skillsTargetDir || join(defaultUserDir, "skills");

    if (!existsSync(this.proposalsDir)) {
      mkdirSync(this.proposalsDir, { recursive: true });
    }
  }

  /**
   * 生成新的技能提案 (SkillProposal)，状态默认 pending
   * 支持传入 SkillProposalCandidate 或传统的 (name, description, instructions, triggerCondition)
   */
  createProposal(
    candidateOrName: SkillProposalCandidate | string,
    description?: string,
    instructions?: string,
    triggerCondition?: string,
  ): SkillProposal {
    let candidate: SkillProposalCandidate;
    if (typeof candidateOrName === "string") {
      candidate = {
        name: candidateOrName,
        description: description || candidateOrName,
        instructions: instructions || "",
        triggerCondition: triggerCondition || "",
        toolChain: [],
        reason: "传统格式构建提案",
      };
    } else {
      candidate = candidateOrName;
    }

    const cleanName = candidate.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const proposal: SkillProposal = {
      id: generateId("prop_"),
      name: cleanName,
      description: candidate.description,
      tags: ["learned", "proposed"],
      instructions: candidate.instructions,
      triggerCondition: candidate.triggerCondition,
      status: "pending",
      createdAt: Date.now(),
      sourceWorkId: candidate.sourceWorkId,
      source: "learned",
    };

    const filePath = join(this.proposalsDir, `${proposal.id}.json`);
    writeFileSync(filePath, JSON.stringify(proposal, null, 2), "utf-8");

    log("info", `💡 [Skill Proposal Created] Candidate: ${proposal.name} (Id: ${proposal.id})`, {
      description: proposal.description,
    });

    return proposal;
  }

  /**
   * 列出提案列表（可按 status 过滤）
   */
  listProposals(statusFilter?: "pending" | "approved" | "rejected"): SkillProposal[] {
    if (!existsSync(this.proposalsDir)) return [];

    const files = readdirSync(this.proposalsDir);
    const proposals: SkillProposal[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = readFileSync(join(this.proposalsDir, file), "utf-8");
        const parsed = JSON.parse(raw) as SkillProposal;
        if (!statusFilter || parsed.status === statusFilter) {
          proposals.push(parsed);
        }
      } catch {
        /* ignore read errors */
      }
    }

    return proposals.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 确认接受提案 (Accept)
   * 状态更新为 approved ➔ 物理落盘至 ~/.hachimi/skills/<name>/SKILL.md ➔ 动态注册并标注 source: "learned"
   */
  acceptProposal(id: string): { success: boolean; message: string; skillPath?: string } {
    const proposals = this.listProposals();
    const proposal = proposals.find((p) => p.id === id);

    if (!proposal) {
      return { success: false, message: `未找到 ID 为 ${id} 的技能提案` };
    }

    proposal.status = "approved";
    writeFileSync(
      join(this.proposalsDir, `${proposal.id}.json`),
      JSON.stringify(proposal, null, 2),
      "utf-8",
    );

    // 物理写入技能目录 ~/.hachimi/skills/<name>/SKILL.md
    const targetDir = join(this.skillsTargetDir, proposal.name);
    mkdirSync(targetDir, { recursive: true });

    const mdContent = `---
name: ${proposal.name}
description: ${proposal.description}
source: learned
tags: [learned, user-approved]
---

# ${proposal.name}

${proposal.instructions}
`;

    const skillMdPath = join(targetDir, "SKILL.md");
    writeFileSync(skillMdPath, mdContent, "utf-8");

    // 动态注册到全局 SkillRegistry（标注 source: "learned"）
    if (this.skillsRegistry) {
      this.skillsRegistry.register({
        name: proposal.name,
        description: proposal.description,
        tags: proposal.tags,
        source: "learned",
        load: () => ({ instructions: proposal.instructions }),
      });
    }

    log(
      "info",
      `🎉 [Skill Proposal Accepted] Skill '${proposal.name}' is now active at ${skillMdPath}`,
    );

    return {
      success: true,
      message: `已成功采纳技能提案 '${proposal.name}' 并落盘注册！`,
      skillPath: skillMdPath,
    };
  }

  /**
   * 拒绝提案 (Reject)
   */
  rejectProposal(id: string): { success: boolean; message: string } {
    const proposals = this.listProposals();
    const proposal = proposals.find((p) => p.id === id);

    if (!proposal) {
      return { success: false, message: `未找到 ID 为 ${id} 的技能提案` };
    }

    proposal.status = "rejected";
    writeFileSync(
      join(this.proposalsDir, `${proposal.id}.json`),
      JSON.stringify(proposal, null, 2),
      "utf-8",
    );

    log("info", `🗑️ [Skill Proposal Rejected] Proposal '${proposal.name}' rejected by user`);
    return { success: true, message: `已拒绝技能提案 '${proposal.name}'` };
  }
}
