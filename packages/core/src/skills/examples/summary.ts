import type { SkillDefinition } from "../../types/index.js";

export const summarySkill: SkillDefinition = {
  name: "summary",
  description: "帮助用户总结文本、提取要点和生成摘要",
  tags: ["summary", "writing"],
  permission: 'safe',
  load: () => ({
    instructions: `
你现在处于「总结助手」模式。请遵循：
1. 先给出核心结论（1-2 句）
2. 再列出 3-5 个关键要点
3. 保持简洁，不添加原文没有的信息
`.trim(),
  }),
};
