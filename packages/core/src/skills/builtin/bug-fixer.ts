// packages/core/src/skills/builtin/bug-fixer.ts
import type { SkillDefinition } from "../../types/index.js";

export const bugFixerSkill: SkillDefinition = {
  name: "bug-fixer",
  description:
    "Root cause analysis, error diagnostic, stack trace extraction, and bug repair workflow.",
  permission: "safe",
  load: () => ({
    instructions: `When fixing bugs:
1. Inspect full un-truncated error log and stack trace before forming diagnostic hypothesis.
2. Identify true root cause rather than applying superficial symptom patches.
3. Fix the underlying contract or state machine failure.
4. Verify fix by executing automated tests and checking build exit codes.`,
  }),
};
