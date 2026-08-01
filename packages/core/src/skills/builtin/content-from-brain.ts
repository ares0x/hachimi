import type { SkillDefinition } from "../../types/index.js";

/**
 * PC-W5 Milestone Skill: Content From Brain
 * 允许 Agent 从 Second Brain (Obsidian Vault) 读取只读知识库笔记，
 * 整理提炼后作为草稿写入唯一受许可的 _inbox 收件箱目录。
 */
export const contentFromBrainSkill: SkillDefinition = {
  name: "content-from-brain",
  description: "从 Second Brain 个人知识库提炼整理素材，并生成规范草稿存入 _inbox 收件箱",
  permission: "safe",
  load: () => ({
    instructions: `
当用户要求“从第二大脑/知识库提炼内容进 Inbox”或使用 content-from-brain 技能时：
1. 使用 read_file 工具读取 Second Brain 知识库中的参考笔记。
2. 结合用户的目标与主题进行结构化提炼与重组。
3. 使用 write_to_file 将排版好的 Markdown 稿件保存至 knowledgeWriteRoot 绑定的 _inbox 目录（例如 knowledgeRoot/_inbox/draft_xxx.md）。
4. 注意：绝对不要尝试写入 _inbox 之外的知识库根目录，这会被 PathJail 沙箱坚固关卡拒绝。
`.trim(),
  }),
};
