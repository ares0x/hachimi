// packages/core/src/context/builder.ts
import type { MemoryEntry } from "../types/index.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { ToolRegistry } from "../tools/registry.js";

export interface ContextBuildInput {
  userInput?: string;
  memories?: MemoryEntry[];
  skills?: SkillRegistry;
  tools?: ToolRegistry;
  activeSkill?: string;           // 新增：按需加载的技能名
  identityOverride?: string;
}

export interface BuiltContext {
  systemPrompt: string;
  parts: {
    identity: string;
    memories?: string;
    skills?: string;
    tools?: string;
    activeSkill?: string;
  };
}

const DEFAULT_IDENTITY = `你是 hachimi，一个个人 AI 助理。`;

export class ContextBuilder {
  constructor(private identity: string = DEFAULT_IDENTITY) {}

  async build(input: ContextBuildInput = {}): Promise<BuiltContext> {
    const blocks: string[] = [];

    // 1. Skills 列表（最前面）
    let skillsBlock = "【当前可用技能列表】\n（空）";
    if (input.skills) {
      const desc = input.skills.getPromptDescriptions();
      if (desc) {
        skillsBlock = `【当前可用技能列表】\n${desc}\n\n【强制规则】当用户问「你有哪些技能」「你会什么」「你的能力」时，你必须且只能列出上面列表里的技能，禁止添加任何列表外能力。`;
      }
    }
    blocks.push(skillsBlock);

    // 2. 按需加载完整 Skill
    if (input.activeSkill && input.skills) {
      const full = await input.skills.getFullSkill(input.activeSkill);
      if (full) {
        const activeText = `【激活技能：${input.activeSkill}】\n${full.instructions}\n\n请严格按照以上指令完成任务。`;
        blocks.push(activeText);
      }
    }

    // 3. 身份
    const identity = input.identityOverride ?? this.identity;
    blocks.push(identity);

    // 4. 记忆
    if (input.memories && input.memories.length > 0) {
      const memoryText = "以下是与当前对话相关的记忆，请在回答时参考：\n" +
        input.memories.map((m) => `- (${m.layer}) ${m.content}`).join("\n");
      blocks.push(memoryText);
    }

    // 5. Tools
    if (input.tools) {
      const list = input.tools.list();
      if (list.length > 0) {
        const toolsText = "【可用工具】\n" +
          list.map((t) => `- ${t.name} [${t.permission ?? "safe"}]: ${t.description}`).join("\n");
        blocks.push(toolsText);
      }
    }

    const systemPrompt = blocks.join("\n\n");

    return {
      systemPrompt,
      parts: {
        identity,
        memories: input.memories?.length ? blocks[3] : undefined,
        skills: skillsBlock,
        tools: input.tools?.list().length ? blocks[blocks.length - 1] : undefined,
        activeSkill: input.activeSkill,
      },
    };
  }
}
