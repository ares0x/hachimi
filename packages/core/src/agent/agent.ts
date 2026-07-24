// packages/core/src/agent/agent.ts
import { generateId, defaultTokenEstimator } from "@hachimi/shared";
import { ContextBuilder } from "../context/builder.js";
import type { MemoryManager } from "../memory/manager.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { LLMProvider, Message, LLMResponse } from "../types/index.js";

export interface AgentOptions {
  llm: LLMProvider;
  tools: ToolRegistry;
  memory: MemoryManager;
  skills?: SkillRegistry;
  contextBuilder?: ContextBuilder;
  maxToolRounds?: number;
  onToolApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    permission: string
  ) => Promise<boolean>;
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
  private activeSkill?: string;
  private running = false;
  private pendingSteerPrompt: string | null = null;
  private followUpQueue: string[] = [];

  private onToolApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    permission: string
  ) => Promise<boolean>;
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

    // B4: 自动注册 activate_skill 工具，由大模型显式调用
    if (this.skills) {
      try {
        this.tools.register(
          this.skills.getActivationTool((skillName) => {
            this.activeSkill = skillName;
            console.log(`[Skill] 显式激活技能: ${skillName}`);
          })
        );
      } catch {
        /* ignore if already registered */
      }
    }
  }

  /** 当前 Agent 是否正在运行 Tool Loop 循环 */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * C6: 中途转向 (Mid-turn Steer)
   * 在 Agent 处于 Tool Loop 执行中途时，动态插入修正指令
   */
  steer(prompt: string): boolean {
    if (!this.running) {
      return false;
    }
    this.pendingSteerPrompt = prompt.trim();
    console.log(`[Agent] 收到中途转向指令 (steer): "${this.pendingSteerPrompt}"`);
    return true;
  }

  /**
   * C6: 连续跟进 (Follow-up)
   * 在当前对话轮次结束后自动排队执行下一条 Prompt
   */
  followUp(prompt: string): void {
    const trimmed = prompt.trim();
    if (trimmed) {
      this.followUpQueue.push(trimmed);
      console.log(`[Agent] 追加跟进指令 (followUp): "${trimmed}"`);
    }
  }

  /** 清空 pendingSteer */
  clearSteer(): void {
    this.pendingSteerPrompt = null;
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
    this.running = true;
    try {
      return await this.executeRun(userInput, history, options);
    } finally {
      this.running = false;
    }
  }

  private async executeRun(
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
        const content = input
          .slice(prefix.length)
          .replace(/^[：:\s]+/, "")
          .trim();
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

    // 2. B3: 混合向量记忆检索
    const relevantMemories = this.memory.search(input, {
      layers: ["session", "long_term"],
      limit: 6,
      minImportance: 0.3,
    });

    // 3. 组装上下文（包含 B4 显式激活的技能）
    const built = await this.contextBuilder.build({
      userInput: input,
      memories: relevantMemories,
      skills: this.skills,
      tools: this.tools,
      activeSkill: this.activeSkill,
      history,
      options: {
        maxTokens: 12000,
        mode: "normal",
        summaryThreshold: 25,
      },
      tokenEstimator: defaultTokenEstimator,
    });

    // 4. 构建底层的 API 请求报文消息序列
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

    // 5. 工具调用循环
    let rounds = 0;
    while (rounds < this.maxToolRounds) {
      rounds++;

      // C6: 检查是否有中途插队的 steer 指令
      if (this.pendingSteerPrompt) {
        const steerMsg = this.pendingSteerPrompt;
        this.pendingSteerPrompt = null;

        messages.push({
          id: generateId("msg_"),
          role: "user",
          content: `[用户中途转向修正指令]: ${steerMsg}`,
          timestamp: Date.now(),
        });
        console.log(`[Agent] 中途转向指令已成功注入当前上下文: "${steerMsg}"`);
      }

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

        // C6: 检查是否有等待跟进的 followUp 任务
        if (this.followUpQueue.length > 0) {
          const nextPrompt = this.followUpQueue.shift()!;
          console.log(`[Agent] 自动触发跟进队列指令: "${nextPrompt}"`);
          return await this.executeRun(nextPrompt, messages, options);
        }

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
          (permission === "needs_confirm" ||
            permission === "dangerous" ||
            toolDef?.requiresApproval)
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
