// packages/core/src/agent/agent.ts
import type { Message, LLMProvider } from "../types/index.js";
import { ToolRegistry } from "../tools/registry.js";
import { MemoryManager } from "../memory/manager.js";
import { SkillRegistry } from "../skills/registry.js";
import { ContextBuilder } from "../context/builder.js";
import { generateId } from "@hachimi/shared";

export interface AgentOptions {
  llm: LLMProvider;
  tools: ToolRegistry;
  memory: MemoryManager;
  skills?: SkillRegistry;
  contextBuilder?: ContextBuilder;
  maxToolRounds?: number;
}

/**
 * Agent 核心循环
 */
export class Agent {
  private llm: LLMProvider;
  private tools: ToolRegistry;
  private memory: MemoryManager;
  private skills?: SkillRegistry;
  private contextBuilder: ContextBuilder;
  private maxToolRounds: number;

  constructor(options: AgentOptions) {
    this.llm = options.llm;
    this.tools = options.tools;
    this.memory = options.memory;
    this.skills = options.skills;
    this.contextBuilder = options.contextBuilder ?? new ContextBuilder();
    this.maxToolRounds = options.maxToolRounds ?? 5;
  }

  /**
   * 执行一轮对话
   */
   async run(userInput: string, history: Message[] = []): Promise<string> {
     const input = userInput.trim();

     // 1. 自然语言记住
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

     // 2. 技能意图检测
     let activeSkill: string | undefined;
     const skillMatch = input.match(/(?:用|使用|以|调用)\s*([\w\u4e00-\u9fa5]+)\s*技能/i);
     if (skillMatch) {
       activeSkill = skillMatch[1].trim();
       console.log(`[Skill] 检测到激活技能: ${activeSkill}`);
     }

     // 3. 检索记忆
     const relevantMemories = this.memory.search(input, {
       layers: ["session", "long_term"],
       limit: 6,
       minImportance: 0.3,
     });

     // 4. 组装上下文（必须 await）
     const built = await this.contextBuilder.build({
       userInput: input,
       memories: relevantMemories,
       skills: this.skills,
       tools: this.tools,
       activeSkill,
     });

     // 5. 组装消息
     const messages: Message[] = [
       {
         id: generateId("msg_"),
         role: "system",
         content: built.systemPrompt,
         timestamp: Date.now(),
       },
       ...history,
       {
         id: generateId("msg_"),
         role: "user",
         content: input,
         timestamp: Date.now(),
       },
     ];

     // 6. 工具调用循环
     let rounds = 0;
     while (rounds < this.maxToolRounds) {
       rounds++;

       const toolDefs = this.tools.list();
       const response = await this.llm.chat(messages, toolDefs);

       if (!response.tool_calls || response.tool_calls.length === 0) {
         const finalContent = response.content ?? "";
         messages.push({
           id: generateId("msg_"),
           role: "assistant",
           content: finalContent,
           timestamp: Date.now(),
         });

         this.memory.add({
           layer: "session",
           content: `用户: ${input}\n助手: ${finalContent}`,
           importance: 0.4,
         });

         return finalContent;
       }

       messages.push({
         id: generateId("msg_"),
         role: "assistant",
         content: response.content ?? "",
         timestamp: Date.now(),
       });

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

  getMemory(): MemoryManager {
    return this.memory;
  }
}
