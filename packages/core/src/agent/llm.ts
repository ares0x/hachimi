// packages/core/src/agent/llm.ts
import type { Message, ToolDefinition, LLMResponse, LLMProvider } from "../types/index.js";
import { generateId } from "@hachimi/shared";

export class MockLLMProvider implements LLMProvider {
  async chat(messages: Message[], tools: ToolDefinition[] = []): Promise<LLMResponse> {
    const lastMessage = messages[messages.length - 1];

    // 工具结果
    if (lastMessage?.role === "tool") {
      return { content: `计算结果是：${lastMessage.content}` };
    }

    // 提取 system 记忆
    const systemMsg = messages.find((m) => m.role === "system");
    const memoryText = typeof systemMsg?.content === "string" ? systemMsg.content : "";
    const hasMemory = memoryText.length > 10;

    // 用户输入
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userContent = typeof lastUser?.content === "string" ? lastUser.content : "";

    // 计算器
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

    // ========== 有记忆时的回复逻辑 ==========
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

      // 4. 喜好 / 喝什么（重点加强）
      if (/喜欢|喜好|喝什么|爱喝|咖啡/.test(userContent)) {
        if (memoryText.includes("美式咖啡") || memoryText.includes("咖啡")) {
          return { content: "根据我的记忆，你喜欢喝美式咖啡。" };
        }
      }

      // 5. 通用（有记忆时）
      return {
        content: `我参考了记忆后回答：${userContent}`,
      };
    }

    // 默认
    return {
      content: `我是 hachimi 的 MockLLM。你刚才说：${userContent}`,
    };
  }
}
