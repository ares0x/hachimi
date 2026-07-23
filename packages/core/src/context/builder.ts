// packages/core/src/context/builder.ts
import type { MemoryEntry } from "../types/index.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Message } from "../types/index.js";
import { defaultTokenEstimator } from '@hachimi/shared';

export interface ContextOptions {
  maxTokens?: number;           // Token 预算上限
  summaryThreshold?: number;    // 历史消息超过多少条触发摘要
  mode?: 'fast' | 'normal' | 'thoughtful'; // 模式影响摘要强度和细节保留
  enableTokenTruncation?: boolean;
}

export interface ContextBuildInput {
  userInput?: string;
  memories?: MemoryEntry[];
  skills?: SkillRegistry;
  tools?: ToolRegistry;
  activeSkill?: string;         // 按需加载的技能名
  identityOverride?: string;
  history?: Message[];
  options?: ContextOptions;
  tokenEstimator?: (text: string) => number; // 可注入的 Token 估算器
}

export interface BuiltContext {
  systemPrompt: string;
  parts: {
    identity: string;
    memories?: string;
    skills?: string;
    tools?: string;
    activeSkill?: string;
    historySummary?: string;
  };
}

const DEFAULT_IDENTITY = `你是 hachimi，一个个人 AI 助理。`;
const DEFAULT_OPTIONS: Required<ContextOptions> = {
  maxTokens: 8000,
  summaryThreshold: 20,
  mode: 'normal',
  enableTokenTruncation: true,
};

export class ContextBuilder {
  constructor(private identity: string = DEFAULT_IDENTITY) {}

  async build(input: ContextBuildInput = {}): Promise<BuiltContext> {
    const opts = { ...DEFAULT_OPTIONS, ...input.options };
    const blocks: string[] = [];

    // 1. Skills 列表（最前面，保持原有逻辑）
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
    let memoriesBlock: string | undefined;
    if (input.memories && input.memories.length > 0) {
      memoriesBlock = "以下是与当前对话相关的记忆，请在回答时参考：\n" +
        input.memories.map((m) => `- (${m.layer}) ${m.content}`).join("\n");
      blocks.push(memoriesBlock);
    }

    // 5. 历史消息 + 智能摘要（核心升级）
    let historySummary: string | undefined;
    if (input.history && input.history.length > 0) {
      const historyBlock = this.buildHistoryBlock(input.history, opts);
      blocks.push(historyBlock);
      historySummary = historyBlock;
    }

    // 6. Tools
    let toolsBlock: string | undefined;
    if (input.tools) {
      const list = input.tools.list();
      if (list.length > 0) {
        toolsBlock = "【可用工具】\n" +
          list.map((t) => `- ${t.name} [${t.permission ?? "safe"}]: ${t.description}`).join("\n");
        blocks.push(toolsBlock);
      }
    }

    let systemPrompt = blocks.join("\n\n");

    // 7. Token 感知截断（Phase B 关键新增）
    if (opts.enableTokenTruncation && input.tokenEstimator) {
      systemPrompt = this.truncateToTokenBudget(systemPrompt, opts.maxTokens, input.tokenEstimator);
    }

    if (input.tokenEstimator) {
      const tokenCount = input.tokenEstimator(systemPrompt);
      const ratio = ((tokenCount / opts.maxTokens) * 100).toFixed(1);

      console.log(`[ContextBuilder] Token 使用: ${tokenCount}/${opts.maxTokens} (${ratio}%) | 模式: ${opts.mode}`);

      if (tokenCount > opts.maxTokens * 0.85) {
        console.warn(`[ContextBuilder] Token 使用率较高 (${ratio}%)，建议注意对话长度`);
      }
    }

    return {
      systemPrompt,
      parts: {
        identity,
        memories: memoriesBlock,
        skills: skillsBlock,
        tools: toolsBlock,
        activeSkill: input.activeSkill,
        historySummary,
      },
    };
  }

  private buildHistoryBlock(history: Message[], opts: Required<ContextOptions>): string {
    if (history.length <= opts.summaryThreshold) {
      return `【对话历史】\n${this.formatRecentMessages(history)}`;
    }

    // 智能摘要
    const summary = this.summarizeHistory(history, opts.mode);
    const recent = this.formatRecentMessages(history.slice(-10));

    return `【对话摘要】\n${summary}\n\n【最近消息】\n${recent}`;
  }

  private formatRecentMessages(messages: Message[]): string {
    return messages
      .map((m) => {
        const contentStr = typeof m.content === 'string'
          ? m.content
          : m.content.map(part => typeof part === 'string' ? part : '[content]').join('');

        return `${m.role}: ${contentStr.substring(0, 120)}${contentStr.length > 120 ? "..." : ""}`;
      })
      .join("\n");
  }

  private summarizeHistory(history: Message[], mode: 'fast' | 'normal' | 'thoughtful'): string {
    if (history.length === 0) return "（无对话历史）";

    const recent = history.slice(-40);

    if (mode === 'fast') {
      return recent.slice(-8)
        .map((m) => {
          const contentStr = typeof m.content === 'string'
            ? m.content
            : m.content.map(part => typeof part === 'string' ? part : '[content]').join('');
          return `${m.role === 'user' ? '用户' : '助手'}: ${contentStr.substring(0, 80)}${contentStr.length > 80 ? '...' : ''}`;
        })
        .join(" | ");
    }

    // normal / thoughtful 模式
    const userInputs = recent
      .filter(m => m.role === 'user')
      .slice(-6)
      .map(m => {
        const contentStr = typeof m.content === 'string' ? m.content : '[complex content]';
        return contentStr;
      });

    const assistantResponses = recent
      .filter(m => m.role === 'assistant')
      .slice(-6)
      .map(m => {
        const contentStr = typeof m.content === 'string' ? m.content : '[complex content]';
        return contentStr;
      });

    let summary = `对话轮次：${recent.length}\n`;

    if (userInputs.length > 0) {
      summary += `用户主要意图：${userInputs.join("；")}\n`;
    }

    if (assistantResponses.length > 0) {
      summary += `助手关键回复摘要：${assistantResponses
        .map(r => r.substring(0, 120))
        .join(" | ")}\n`;
    }

    if (mode === 'thoughtful' && recent.length > 15) {
      summary += `\n长期关注点：用户似乎在开发 AI 助理项目（hachimi）。`;
    }

    return summary.trim();
  }

  private truncateToTokenBudget(prompt: string, maxTokens: number, estimator: (text: string) => number): string {
    let current = prompt;
    let tokens = estimator(current);

    if (tokens <= maxTokens) return current;

    // 简单递归压缩：逐步移除或缩短历史部分
    console.warn(`[ContextBuilder] Prompt 超过 Token 限制 (${tokens} > ${maxTokens})，正在压缩...`);

    // 示例压缩策略：截断到最近内容
    const lines = current.split("\n\n");
    while (tokens > maxTokens && lines.length > 3) {
      lines.splice(4, 1); // 保留前几块，移除中间历史
      current = lines.join("\n\n");
      tokens = estimator(current);
    }

    return current;
  }
}
