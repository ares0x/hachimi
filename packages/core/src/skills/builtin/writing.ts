// packages/core/src/skills/builtin/writing.ts
import type { SkillDefinition } from "../../types/index.js";

export const writingSkill: SkillDefinition = {
  name: "writing",
  description: "帮助用户进行写作、润色、改写和结构化表达",
  tags: ["writing", "content"],
  permission: "safe",
  load: () => ({
    instructions: `
你现在处于「写作助手」模式。请遵循以下原则：
1. 保持用户的原意，只优化表达
2. 语言简洁、有力
3. 根据用户需求调整语气（正式 / 轻松 / 专业）
4. 如果用户没有指定风格，默认使用清晰、自然的书面语
`.trim(),
    examples: ["请帮我润色这段话：...", "把这段改得更正式一点", "帮我写一个简短的产品介绍"],
  }),
};
