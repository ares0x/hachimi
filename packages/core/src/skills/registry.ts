// packages/core/src/skills/registry.ts
import type { SkillContent, SkillDefinition, ToolDefinition } from "../types/index.js";

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();
  private disabledSkills = new Set<string>();

  register(skill: SkillDefinition) {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill already registered: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
    console.log(`[Skill] 注册: ${skill.name} [权限: ${skill.permission || "safe"}]`);
  }

  get(name: string) {
    return this.skills.get(name);
  }

  list() {
    return Array.from(this.skills.values()).map((s) => ({
      ...s,
      enabled: !this.disabledSkills.has(s.name),
    }));
  }

  disable(name: string) {
    this.disabledSkills.add(name);
  }

  enable(name: string) {
    this.disabledSkills.delete(name);
  }

  getPromptDescriptions(): string {
    if (this.skills.size === 0) return "";
    const lines = this.list().map(
      (s) => `- ${s.name}: ${s.description} [${s.permission || "safe"}]`
    );
    return `你可以使用以下技能（需要时可使用 activate_skill 工具进行激活）：\n${lines.join("\n")}`;
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
  hasPermission(name: string, required: "safe" | "needs_confirm" | "dangerous" = "safe"): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    const skillLevel = skill.permission || "safe";
    const levels: Record<string, number> = { safe: 0, needs_confirm: 1, dangerous: 2 };
    return levels[skillLevel] <= levels[required];
  }

  listWithPermissions() {
    return this.list().map((s) => ({
      name: s.name,
      description: s.description,
      permission: s.permission || "safe",
    }));
  }

  /**
   * 生成供 LLM 显式调用的 activate_skill 工具定义
   */
  getActivationTool(onActivate?: (skillName: string) => void): ToolDefinition {
    return {
      name: "activate_skill",
      description:
        "Dynamically activates and loads detailed instructions for a specific skill by name.",
      parameters: {
        type: "object",
        properties: {
          skill_name: {
            type: "string",
            description: "The name of the skill to activate",
          },
        },
        required: ["skill_name"],
      },
      permission: "safe",
      execute: async (args) => {
        const skillName = String(args.skill_name || "").trim();
        const skill = this.skills.get(skillName);
        if (!skill) {
          return `未找到名称为 ${skillName} 的技能。`;
        }
        const content = await this.loadContent(skillName);
        if (!content) {
          return `技能 ${skillName} 加载失败。`;
        }
        if (onActivate) {
          onActivate(skillName);
        }
        return `技能 [${skillName}] 已成功激活加载！指令：${content.instructions}`;
      },
    };
  }

  clear() {
    this.skills.clear();
  }
}
