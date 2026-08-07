// packages/core/src/skills/builtin/readme-generator.ts
import type { SkillDefinition } from "../../types/index.js";

export const readmeGeneratorSkill: SkillDefinition = {
  name: "readme-generator",
  description:
    "Generate structured, professional markdown README documentation for software repositories.",
  permission: "safe",
  load: () => ({
    instructions: `When generating README.md:
1. Include high-level project vision, key features, architecture overview, and quickstart commands.
2. Outline package structure and configuration options clearly using Markdown tables.
3. Keep descriptions concise, accurate, and professional.`,
  }),
};
