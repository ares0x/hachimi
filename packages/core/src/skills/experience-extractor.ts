// packages/core/src/skills/experience-extractor.ts
// Re-export W4 evolution modules for backward compatibility

export {
  TrajectoryCompressor,
  type SkillProposalCandidate,
} from "./trajectory-compressor.js";

export {
  SkillProposalManager,
  type SkillProposal,
  type SkillProposal as SkillDraft,
} from "./skill-proposal-manager.js";

export interface TrajectoryTurn {
  userGoal: string;
  toolCalls: string[];
  hasUserCorrection: boolean;
  assistantResponse: string;
}
