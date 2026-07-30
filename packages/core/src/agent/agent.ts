// packages/core/src/agent/agent.ts
import {
  DEFAULT_MAX_TOOL_ROUNDS,
  defaultTokenEstimator,
  formatUserRejectionMessage,
  generateId,
} from "@hachimi/shared";
import { ContextBuilder } from "../context/builder.js";
import type { HookRegistry } from "../extensions/hooks.js";
import type { MemoryManager } from "../memory/manager.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { SurfaceType } from "../tools/policy.js";
import type { ToolRegistry } from "../tools/registry.js";
import type {
  ChannelType,
  LLMProvider,
  Message,
  ToolCall,
  ToolPermission,
} from "../types/index.js";
import type { WorkManager } from "../work/work-manager.js";

/**
 * P1: Completion requirement — harness-level enforcement that the agent
 * MUST call a specific tool before finishing. If the agent stops without
 * calling it, the harness injects a reminder and retries (up to maxRetries).
 */
export interface CompletionRequirement {
  /** Tool name that must be called (e.g. "complete_task") */
  tool: string;
  /** Reminder injected when agent stops without calling the tool */
  reminder: string;
  /** Max retries, default 3 */
  maxRetries?: number;
}

export interface AgentRunOptions {
  onChunk?: (chunk: string) => void;
  onThinking?: (reasoningContent: string) => void;
  onIntermediateMessage?: (content: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>, toolCallId?: string) => void;
  onToolEnd?: (
    name: string,
    result: string,
    durationMs: number,
    success: boolean,
    toolCallId?: string
  ) => void;
  hooks?: HookRegistry;
  sessionId?: string;
  /**
   * 调用表面（与 PermissionPolicy surface 对齐）
   * 如 tui | web | web-sse | desktop | telegram | api | cli …
   * 传给 ToolRegistry.execute() 的 channel 字段以激活 PermissionPolicy 矩阵
   */
  channel?: SurfaceType | ChannelType;
  // W1.3: 当前 Work ID (1:1 映射 sessionId)，供内置工具 update_work_plan 更新 plan
  workId?: string;
  /** W1.3: WorkManager 实例，供内置工具 update_work_plan 写入 plan 到文件 */
  workManager?: WorkManager;
  /**
   * Per-call 交互式审批 handler（如 API server 的 SSE confirm_required + /api/tools/approve）。
   * 优先于构造时的 this.onToolApproval，使交互式审批在非 TUI 表面真正生效。
   */
  onToolApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    permission: string
  ) => Promise<boolean>;
  /**
   * W2.2: 每次触发 onToolApproval 回调之前调用，用于写入 approval_requested 事件
   * （可由 HarnessRuntime 或 server 层注入）
   */
  onApprovalRequested?: (info: {
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    permission: string;
  }) => void | Promise<void>;
  /**
   * P1: Completion requirement — harness enforces that the agent must call
   * the specified tool before finishing. If the agent stops without it,
   * the harness injects the reminder and retries.
   */
  completionRequirement?: CompletionRequirement;
}

export interface AgentOptions {
  llm: LLMProvider;
  tools: ToolRegistry;
  memory: MemoryManager;
  skills?: SkillRegistry;
  contextBuilder?: ContextBuilder;
  hooks?: HookRegistry;
  maxToolRounds?: number;
  /** Context budget — fed from config.context */
  maxTokens?: number;
  summaryThreshold?: number;
  mode?: "fast" | "normal" | "thoughtful";
  onToolApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    permission: string
  ) => Promise<boolean>;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, result: string, durationMs: number, success: boolean) => void;
}

/**
 * Agent core execution loop
 */
export class Agent {
  private llm: LLMProvider;
  private tools: ToolRegistry;
  private memory: MemoryManager;
  private skills?: SkillRegistry;
  private contextBuilder: ContextBuilder;
  private hooks?: HookRegistry;
  private maxToolRounds: number;
  private contextMaxTokens: number;
  private contextMode: "fast" | "normal" | "thoughtful";
  private contextSummaryThreshold: number;
  private activeSkill?: string;
  private running = false;
  private pendingSteerPrompt: string | null = null;
  private followUpQueue: string[] = [];
  /** 拒绝熔断：per-tool 拒绝计数 + 总拒绝计数（每轮 run 重置），防止用户拒绝后死循环重试 */
  private rejectionCounts: Map<string, number> = new Map();
  private totalRejections = 0;
  private readonly maxRejectionsPerTool = 2;
  private readonly maxTotalRejections = 3;

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
    this.hooks = options.hooks;
    this.maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
    this.contextMaxTokens = options.maxTokens ?? 12000;
    this.contextMode = options.mode ?? "normal";
    this.contextSummaryThreshold = options.summaryThreshold ?? 25;
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
    options?: AgentRunOptions
  ): Promise<string> {
    this.running = true;
    this.rejectionCounts.clear();
    this.totalRejections = 0;
    try {
      return await this.executeRun(userInput, history, options);
    } finally {
      this.running = false;
    }
  }

  /** P1: Tools called during the current run — used for completion requirement enforcement */
  private toolsCalledThisRun: Set<string> = new Set();

  private async executeRun(
    userInput: string,
    history: Message[] = [],
    options?: AgentRunOptions
  ): Promise<string> {
    const input = userInput.trim();
    this.toolsCalledThisRun = new Set(); // reset per-run

    // 1. 自然语言记住 (W5.5.4: 经过标准 ToolRegistry 管道与 RuntimeEvent 留痕)
    const rememberPrefixes = ["请记住", "记住", "帮我记一下", "记一下"];
    for (const prefix of rememberPrefixes) {
      if (input.startsWith(prefix)) {
        const content = input
          .slice(prefix.length)
          .replace(/^[：:\s]+/, "")
          .trim();
        if (content) {
          // 动态注册 save_memory 确保在工具管道中可被找到与记录
          if (!this.tools.get("save_memory")) {
            this.tools.register({
              name: "save_memory",
              description: "保存重要的用户偏好、事实或决策到长期记忆中",
              permission: "safe",
              parameters: {
                type: "object",
                properties: {
                  content: { type: "string", description: "需要记住的具体信息" },
                },
                required: ["content"],
              },
              execute: async (args) => {
                const text = String(args.content ?? "").trim();
                this.memory.remember(text, 0.75);
                return `好的，我已经记住了：${text}`;
              },
            });
          }

          const channel = options?.channel ?? "api";
          const toolStartHandler = options?.onToolStart ?? this.onToolStart;
          const toolEndHandler = options?.onToolEnd ?? this.onToolEnd;
          if (toolStartHandler) {
            toolStartHandler("save_memory", { content });
          }

          const reply = await this.tools.execute("save_memory", { content }, { channel });

          if (toolEndHandler) {
            toolEndHandler("save_memory", reply, 0, true);
          }

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
        maxTokens: this.contextMaxTokens,
        mode: this.contextMode,
        summaryThreshold: this.contextSummaryThreshold,
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

      if (response.reasoning_content) {
        if (options?.onThinking) {
          options.onThinking(response.reasoning_content);
        }
      }

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const finalContent = response.content ?? "";

        // P1: Completion requirement enforcement — harness-level contract
        const completion = options?.completionRequirement;
        const completionRetries = (options as any)?._completionRetries ?? 0;
        if (
          completion &&
          !this.toolsCalledThisRun.has(completion.tool) &&
          completionRetries < (completion.maxRetries ?? 3)
        ) {
          const reminder = completion.reminder;
          console.log(
            `[Agent] Completion requirement not met — tool '${completion.tool}' not called. ` +
              `Retry ${completionRetries + 1}/${completion.maxRetries ?? 3}. Injecting reminder.`
          );
          messages.push({
            id: generateId("msg_"),
            role: "user",
            content: reminder,
            timestamp: Date.now(),
          });
          // Pass incremented retry count through options
          const retryOptions = {
            ...options,
            _completionRetries: completionRetries + 1,
          };
          return await this.executeRun(reminder, messages, retryOptions);
        }

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

      console.log(
        `[Agent ToolLoop Round ${rounds}] ToolCalls:`,
        response.tool_calls.map((c) => `${c.name}(${JSON.stringify(c.arguments)})`)
      );

      // 有工具调用：如果包含中间助手回答文本，触发回调通知记录
      const interContent = (response.content || "").trim();
      if (interContent && options?.onIntermediateMessage) {
        options.onIntermediateMessage(interContent);
      }

      messages.push({
        id: generateId("msg_"),
        role: "assistant",
        content: response.content ?? "",
        tool_calls: response.tool_calls,
        timestamp: Date.now(),
      });

      // P1: Partition tool calls into concurrent-safe and serial batches.
      // Read-only + safe tools can run in parallel; write/dangerous tools run serially.
      const { concurrent, serial } = this.partitionToolCalls(response.tool_calls);

      // Execute concurrent batch in parallel
      const concurrentResults = await Promise.all(
        concurrent.map((call) => this.executeOneTool(call, messages, options))
      );

      // Execute serial batch one at a time
      for (const call of serial) {
        await this.executeOneTool(call, messages, options);
      }
    }

    const stopMsg = "\n\n⚠️ [达到最大工具调用轮次，已停止执行]";
    if (options?.onChunk) {
      options.onChunk(stopMsg);
    }
    return stopMsg;
  }

  // ── P1: Tool Concurrency Partitioning ──────────────────────────────

  /** Derive concurrency safety: explicit flag > readOnly+safe heuristic > false */
  private isToolConcurrencySafe(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) return false;
    if (tool.isConcurrencySafe !== undefined) return tool.isConcurrencySafe;
    return tool.readOnly === true && tool.permission === "safe";
  }

  /** Split tool calls into concurrent-safe and serial batches */
  private partitionToolCalls(calls: ToolCall[]): {
    concurrent: ToolCall[];
    serial: ToolCall[];
  } {
    const concurrent: ToolCall[] = [];
    const serial: ToolCall[] = [];
    for (const call of calls) {
      if (this.isToolConcurrencySafe(call.name)) {
        concurrent.push(call);
      } else {
        serial.push(call);
      }
    }
    return { concurrent, serial };
  }

  /** Execute one tool call and append result to messages. Thread-safe for parallel calls. */
  private async executeOneTool(
    call: ToolCall,
    messages: Message[],
    options?: AgentRunOptions
  ): Promise<void> {
    this.toolsCalledThisRun.add(call.name);
    const toolDef = this.tools.get(call.name);
    const permission = (toolDef?.permission ?? "safe") as ToolPermission;

    const startTime = Date.now();
    const toolStartHandler = options?.onToolStart ?? this.onToolStart;
    const toolEndHandler = options?.onToolEnd ?? this.onToolEnd;
    if (toolStartHandler) {
      toolStartHandler(call.name, call.arguments, call.id);
    }

    let approved = true;
    const approvalHandler = options?.onToolApproval ?? this.onToolApproval;
    const surface = (options?.channel ?? "api") as SurfaceType;
    const policyDecision = this.tools
      .getPermissionPolicy()
      .decide(surface, call.name, toolDef?.permission ?? "safe");

    if (policyDecision === "deny") {
      approved = false;
    } else if (policyDecision === "require_approval") {
      const priorRejections = this.rejectionCounts.get(call.name) || 0;
      if (priorRejections >= this.maxRejectionsPerTool) {
        this.totalRejections++;
        const stopMsg = `[已停止] 工具 ${call.name} 已被拒绝 ${priorRejections} 次，请停止重试并向用户说明，或改用其他方式。`;
        messages.push({
          id: generateId("msg_"),
          role: "tool",
          content: stopMsg,
          tool_call_id: call.id,
          name: call.name,
          timestamp: Date.now(),
        });
        if (toolEndHandler) toolEndHandler(call.name, stopMsg, 0, false, call.id);
        return;
      }

      if (approvalHandler) {
        if (options?.onApprovalRequested) {
          const approvalId = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          try {
            await options.onApprovalRequested({
              approvalId,
              toolName: call.name,
              args: call.arguments,
              permission,
            });
          } catch {
            /* non-blocking */
          }
        }
        approved = await approvalHandler(call.name, call.arguments, permission);
      } else {
        approved = false;
      }
      if (!approved) {
        this.rejectionCounts.set(call.name, priorRejections + 1);
        this.totalRejections++;
      }
    }

    const result = approved
      ? await this.tools.execute(call.name, call.arguments, {
          confirm: approved,
          onToolApproval: approvalHandler,
          hooks: options?.hooks || this.hooks,
          sessionId: options?.sessionId,
          channel: options?.channel,
          workId: options?.workId,
          workManager: options?.workManager,
        })
      : formatUserRejectionMessage(call.name);

    const durationMs = Date.now() - startTime;
    if (toolEndHandler) {
      toolEndHandler(call.name, result, durationMs, approved, call.id);
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

  getMemory(): MemoryManager {
    return this.memory;
  }
}
