// packages/core/src/skills/registry.ts
import type { SkillDefinition, SkillContent } from "../types/index.js";

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();

  register(skill: SkillDefinition) {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill already registered: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
    console.log(`[Skill] 注册: ${skill.name} [权限: ${skill.permission || 'safe'}]`);
  }

  get(name: string) {
    return this.skills.get(name);
  }

  list() {
    return Array.from(this.skills.values());
  }

  getPromptDescriptions(): string {
    if (this.skills.size === 0) return "";
    const lines = this.list().map(
      (s) => `- ${s.name}: ${s.description} [${s.permission || 'safe'}]`
    );
    return `你可以使用以下技能（需要时再深入使用）：\n${lines.join("\n")}`;
  }

  async loadContent(name: string): Promise<SkillContent | null> {
    const skill = this.skills.get(name);
    if (!skill) return null;
    try {
      return await skill.load();
    } catch (err) {
      console.error(`[Skill] 加载失败 ${name}:`, err);
      return null;
    }
  }

  async getFullSkill(name: string): Promise<SkillContent | null> {
    return this.loadContent(name);
  }

  /** 权限检查 */
  hasPermission(name: string, required: 'safe' | 'needs_confirm' | 'dangerous' = 'safe'): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    const skillLevel = skill.permission || 'safe';
    const levels: Record<string, number> = { safe: 0, needs_confirm: 1, dangerous: 2 };
    return levels[skillLevel] <= levels[required];
  }

  listWithPermissions() {
    return this.list().map(s => ({
      name: s.name,
      description: s.description,
      permission: s.permission || 'safe',
    }));
  }

  clear() {
    this.skills.clear();
  }
}
