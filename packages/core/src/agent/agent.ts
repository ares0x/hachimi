// packages/core/src/agent/agent.ts

import type { Message, LLMProvider } from "../types/index.js";
import { ToolRegistry } from "../tools/registry.js";
import { MemoryManager } from "../memory/manager.js";
import { generateId } from "@hachimi/shared";

export interface AgentOptions {
  llm: LLMProvider;
  tools: ToolRegistry;
  memory: MemoryManager;
  maxToolRounds?: number;
}

/**
 * 最简 Agent 实现（Phase 1 + Phase 2 初期）
 * - 支持工具调用循环
 * - 支持分层 Memory 检索并注入上下文
 */
export class Agent {
  private llm: LLMProvider;
  private tools: ToolRegistry;
  private memory: MemoryManager;
  private maxToolRounds: number;

  constructor(options: AgentOptions) {
    this.llm = options.llm;
    this.tools = options.tools;
    this.memory = options.memory;
    this.maxToolRounds = options.maxToolRounds ?? 5;
  }

  /**
   * 执行一轮对话
   * @param userInput 用户输入
   * @param history 可选的历史消息（通常由外部 Session 管理）
   */
  async run(userInput: string, history: Message[] = []): Promise<string> {
      console.log("[DEBUG] Agent.run 收到输入:", JSON.stringify(userInput));
      const input = userInput.trim();

        // ========== 自然语言记住（更宽松的检测） ==========
        const rememberPrefixes = ["请记住", "记住", "帮我记一下", "记一下"];

        for (const prefix of rememberPrefixes) {
          if (input.startsWith(prefix)) {
            const content = input.slice(prefix.length).replace(/^[：:\s]+/, "").trim();

            if (content) {
              this.memory.remember(content, 0.75);
              return `好的，我已经记住了：${content}`;
            } else {
              return "请告诉我需要记住的具体内容，例如：请记住我喜欢喝手冲咖啡";
            }
          }
        }
        // ========== 检测结束 ==========

        // 后面原来的 memory.search 逻辑保持不变...
        const relevantMemories = this.memory.search(input, {
          layers: ["session", "long_term"],
          limit: 6,
          minImportance: 0.3,
        });
    const messages: Message[] = [];

    // 2. 如果有相关记忆，注入为 system 消息
    if (relevantMemories.length > 0) {
      const memoryText = relevantMemories
        .map((m) => `- (${m.layer}) ${m.content}`)
        .join("\n");

      messages.push({
        id: generateId("msg_"),
        role: "system",
        content: `以下是与当前对话相关的记忆，请在回答时参考：\n${memoryText}`,
        timestamp: Date.now(),
      });
    }

    // 3. 加入历史消息 + 当前用户输入
    messages.push(...history);
    messages.push({
      id: generateId("msg_"),
      role: "user",
      content: userInput,
      timestamp: Date.now(),
    });

    // 4. 工具调用循环
    let rounds = 0;

    while (rounds < this.maxToolRounds) {
      rounds++;

      const toolDefs = this.tools.list();
      const response = await this.llm.chat(messages, toolDefs);

      // 没有工具调用 → 返回最终回答
      if (!response.tool_calls || response.tool_calls.length === 0) {
        const finalContent = response.content ?? "";

        messages.push({
          id: generateId("msg_"),
          role: "assistant",
          content: finalContent,
          timestamp: Date.now(),
        });

        // 5. 简单记录本次交互到 session memory（后续可做得更智能）
        this.memory.add({
          layer: "session",
          content: `用户: ${userInput}\n助手: ${finalContent}`,
          importance: 0.4,
        });

        return finalContent;
      }

      // 有工具调用
      messages.push({
        id: generateId("msg_"),
        role: "assistant",
        content: response.content ?? "",
        timestamp: Date.now(),
      });

      // 执行工具（Phase 1/2 先串行）
      for (const call of response.tool_calls) {
        const result = await this.tools.execute(call.name, call.arguments);

        messages.push({
          id: generateId("msg_"),
          role: "tool",
          content: result,
          tool_call_id: call.id,
          name: call.name,
          timestamp: Date.now(),
        });
      }
    }

    return "达到最大工具调用轮次，已停止执行。";
  }

  /**
   * 获取当前使用的 MemoryManager（方便外部操作）
   */
  getMemory(): MemoryManager {
    return this.memory;
  }
}
