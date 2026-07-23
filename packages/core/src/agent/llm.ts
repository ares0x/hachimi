// packages/core/src/agent/llm.ts
import type { Message, ToolDefinition, LLMResponse, LLMProvider } from "../types/index.js";
import { generateId } from "@hachimi/shared";

export class MockLLMProvider implements LLMProvider {
  async chat(messages: Message[], tools: ToolDefinition[] = []): Promise<LLMResponse> {
    const lastMessage = messages[messages.length - 1];

    // 1. 工具结果优先
    if (lastMessage?.role === "tool") {
      return { content: `计算结果是：${lastMessage.content}` };
    }

    // 2. 提取 system 消息（记忆 + Skills）
    const systemMsg = messages.find((m) => m.role === "system");
    const systemText = typeof systemMsg?.content === "string" ? systemMsg.content : "";
    const hasMemory = systemText.length > 10;
    const hasSkillsList = systemText.includes("技能列表") || systemText.includes("writing");

    // 3. 用户输入
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userContent = typeof lastUser?.content === "string" ? lastUser.content : "";

    // 4. 计算器
    const hasCalculator = tools.some((t) => t.name === "calculator");
    const calcMatch = userContent.match(/(\d+)\s*([\+\-\*\/])\s*(\d+)/);
    if (hasCalculator && calcMatch) {
      const [, a, op, b] = calcMatch;
      return {
        content: null,
        tool_calls: [
          {
            id: generateId("call_"),
            name: "calculator",
            arguments: { a: Number(a), b: Number(b), operator: op },
          },
        ],
      };
    }

    // 5. 问技能（最强优先）
    if (/你有哪些技能|你会什么|你的能力|你的技能/.test(userContent)) {
      if (hasSkillsList) {
        return {
          content: `我目前配置了以下技能：\n- writing: 帮助用户进行写作、润色、改写和结构化表达\n- summary: 帮助用户总结文本、提取要点和生成摘要`,
        };
      }
    }

    // 6. 有记忆时的回复逻辑
    if (hasMemory) {
      // 1. 身份
      if (/我是谁|名字|叫什么/.test(userContent)) {
        return { content: "你是小明。根据记忆，你喜欢简洁的回答。" };
      }
      // 2. 项目
      if (/项目|在做|开发什么|hachimi/.test(userContent)) {
        return { content: "你正在开发一个叫 hachimi 的个人助理项目。" };
      }
      // 3. 技术栈
      if (/技术|用什么|前端|语言|TypeScript|Go/.test(userContent)) {
        return { content: "你是一名前端开发者，熟悉 TypeScript 和 Go。" };
      }
      // 4. 喜好 / 喝什么
      if (/喜欢|喜好|喝什么|爱喝|咖啡/.test(userContent)) {
        if (systemText.includes("手冲咖啡") || systemText.includes("咖啡")) {
          return { content: "根据我的记忆，你喜欢喝手冲咖啡。" };
        }
      }
      // 5. 通用有记忆回复
      return {
        content: `我参考了记忆后回答：${userContent}`,
      };
    }

    // 7. 默认回复
    return {
      content: `我是 hachimi 的 MockLLM。你刚才说：${userContent}`,
    };
  }
}
