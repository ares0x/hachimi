// packages/core/src/skills/builtin/refactoring.ts
import type { SkillDefinition } from "../../types/index.js";

export const refactoringSkill: SkillDefinition = {
  name: "refactoring",
  description:
    "Refactoring principles for modularization, reducing complexity, and improving maintainability.",
  permission: "safe",
  load: () => ({
    instructions: `When refactoring codebase logic:
1. Preserve original behavior and backward compatibility unless breaking change is explicit.
2. Break down monolithic functions into focused, reusable, single-responsibility helpers.
3. Apply surgical file editing via replace_file_content instead of overwriting whole files.
4. Always run typecheck and test suite after refactoring to ensure 0 regression.`,
  }),
};
