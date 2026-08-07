// packages/core/src/skills/builtin/code-review.ts
import type { SkillDefinition } from "../../types/index.js";

export const codeReviewSkill: SkillDefinition = {
  name: "code-review",
  description:
    "Automated code review, security audit, type safety check, and clean code evaluation.",
  permission: "safe",
  load: () => ({
    instructions: `When performing code reviews:
1. Inspect type safety, potential null dereferences, and boundary conditions.
2. Check for security flaws (e.g. unsanitized shell inputs, unhandled path traversals).
3. Evaluate API design consistency, readability, and DRY principles.
4. Output constructive, actionable feedback with specific line references.`,
  }),
};
