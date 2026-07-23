import type { SkillDefinition, SkillContent } from "../types/index.js";

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();

  register(skill: SkillDefinition) {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill already registered: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
  }

  get(name: string) {
    return this.skills.get(name);
  }

  list() {
    return Array.from(this.skills.values());
  }

  /** 只返回用于系统提示词的短描述列表 */
  getPromptDescriptions(): string {
    if (this.skills.size === 0) return "";

    const lines = this.list().map(
      (s) => `- ${s.name}: ${s.description}`
    );
    return `你可以使用以下技能（需要时再深入使用）：\n${lines.join("\n")}`;
  }

  async loadContent(name: string): Promise<SkillContent | null> {
    const skill = this.skills.get(name);
    if (!skill) return null;
    return await skill.load();
  }

  async getFullSkill(name: string): Promise<SkillContent | null> {
    const skill = this.skills.get(name);
    if (!skill) return null;
    return await skill.load();
  }
}
