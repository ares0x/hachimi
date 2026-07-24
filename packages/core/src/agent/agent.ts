// packages/core/src/agent/agent.ts
import type { Message, LLMProvider } from "../types/index.js";
import { ToolRegistry } from "../tools/registry.js";
import { MemoryManager } from "../memory/manager.js";
import { SkillRegistry } from "../skills/registry.js";
import { ContextBuilder } from "../context/builder.js";
import { generateId, defaultTokenEstimator } from "@hachimi/shared";

export interface AgentOptions {
  llm: LLMProvider;
  tools: ToolRegistry;
  memory: MemoryManager;
  skills?: SkillRegistry;
  contextBuilder?: ContextBuilder;
  maxToolRounds?: number;
  onToolApproval?: (toolName: string, args: Record<string, unknown>, permission: string) => Promise<boolean>;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, result: string, durationMs: number, success: boolean) => void;
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
  private onToolApproval?: (toolName: string, args: Record<string, unknown>, permission: string) => Promise<boolean>;
  private onToolStart?: (name: string, args: Record<string, unknown>) => void;
  private onToolEnd?: (name: string, result: string, durationMs: number, success: boolean) => void;

  constructor(options: AgentOptions) {
    this.llm = options.llm;
    this.tools = options.tools;
    this.memory = options.memory;
    this.skills = options.skills;
    this.contextBuilder = options.contextBuilder ?? new ContextBuilder();
    this.maxToolRounds = options.maxToolRounds ?? 5;
    this.onToolApproval = options.onToolApproval;
    this.onToolStart = options.onToolStart;
    this.onToolEnd = options.onToolEnd;
  }

  /**
   * 执行一轮对话
   */
  async run(
    userInput: string,
    history: Message[] = [],
    options?: {
      onChunk?: (chunk: string) => void;
      onToolStart?: (name: string, args: Record<string, unknown>) => void;
      onToolEnd?: (name: string, result: string, durationMs: number, success: boolean) => void;
    }
  ): Promise<string> {
    const input = userInput.trim();

    // 1. 自然语言记住
    const rememberPrefixes = ["请记住", "记住", "帮我记一下", "记一下"];
    for (const prefix of rememberPrefixes) {
      if (input.startsWith(prefix)) {
        const content = input.slice(prefix.length).replace(/^[：:\s]+/, "").trim();
        if (content) {
          this.memory.remember(content, 0.75);
          const reply = `好的，我已经记住了：${content}`;
          if (options?.onChunk) options.onChunk(reply);
          return reply;
        } else {
          const reply = "请告诉我需要记住的具体内容，例如：请记住我喜欢喝手冲咖啡";
          if (options?.onChunk) options.onChunk(reply);
          return reply;
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

    // 4. 组装上下文（已使用优化后的 Builder）
    const built = await this.contextBuilder.build({
      userInput: input,
      memories: relevantMemories,
      skills: this.skills,
      tools: this.tools,
      activeSkill,
      history,
      options: {
        maxTokens: 12000,           // 推荐从 config 包读取
        mode: 'normal',
        summaryThreshold: 25,
      },
      tokenEstimator: defaultTokenEstimator,   // 关键：传入 Token Estimator
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
      const response = this.llm.chatStream
        ? await this.llm.chatStream(messages, toolDefs, options?.onChunk)
        : await this.llm.chat(messages, toolDefs);

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

      // 有工具调用
      messages.push({
        id: generateId("msg_"),
        role: "assistant",
        content: response.content ?? "",
        tool_calls: response.tool_calls,
        timestamp: Date.now(),
      });

      for (const call of response.tool_calls) {
        const toolDef = this.tools.get(call.name);
        const permission = toolDef?.permission ?? "safe";

        const startTime = Date.now();
        if (this.onToolStart) {
          this.onToolStart(call.name, call.arguments);
        } else if (options?.onToolStart) {
          options.onToolStart(call.name, call.arguments);
        }

        let approved = true;
        if (
          this.onToolApproval &&
          (permission === "needs_confirm" || permission === "dangerous" || toolDef?.requiresApproval)
        ) {
          approved = await this.onToolApproval(call.name, call.arguments, permission);
        }

        const result = approved
          ? await this.tools.execute(call.name, call.arguments)
          : `[用户拦截] 工具 ${call.name} 的执行请求已被用户拒绝。`;

        const durationMs = Date.now() - startTime;
        if (this.onToolEnd) {
          this.onToolEnd(call.name, result, durationMs, approved);
        } else if (options?.onToolEnd) {
          options.onToolEnd(call.name, result, durationMs, approved);
        }

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
