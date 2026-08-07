// packages/core/src/knowledge/index.ts

export type { KnowledgeDistillationConfig } from "./distiller.js";
export {
  DEFAULT_DISTILLATION,
  DISTILL_PROMPT,
  KnowledgeDistiller,
  type KnowledgeDistillerResult,
  resolveDistillationConfig,
} from "./distiller.js";
