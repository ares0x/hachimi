// packages/core/src/skills/experience-extractor.ts
// Re-export W4 evolution modules for backward compatibility

export {
  type SkillProposal,
  type SkillProposal as SkillDraft,
  SkillProposalManager,
} from "./skill-proposal-manager.js";
export {
  type SkillProposalCandidate,
  TrajectoryCompressor,
} from "./trajectory-compressor.js";

export interface TrajectoryTurn {
  userGoal: string;
  toolCalls: string[];
  hasUserCorrection: boolean;
  assistantResponse: string;
}
