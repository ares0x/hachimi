// packages/core/src/context/builder.ts
import { createHash } from "node:crypto";
import { DEFAULT_TOKEN_BUDGET, MASTER_AGENT_SYSTEM_PROMPT } from "@hachimi/shared";
import type { MemoryManager } from "../memory/manager.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { MemoryEntry, Message } from "../types/index.js";

export interface ContextOptions {
  maxTokens?: number; // Token 预算上限
  summaryThreshold?: number; // 历史消息超过多少条触发摘要
  mode?: "fast" | "normal" | "thoughtful"; // 模式影响摘要强度和细节保留
  enableTokenTruncation?: boolean;
  toolResultMaxBytes?: number; // W5.1: tool_result 最大字节数限制（默认 4096）
  /**
   * Layer 1: Total byte budget for ALL tool results in message history.
   * When the aggregate exceeds this, oldest tool results are trimmed with
   * placeholders. Prevents 30+ file reads from silently filling the context.
   * Default: 60000 (~60KB, ≈15-20 typical read_file results).
   */
  maxToolResultTotalBytes?: number;
  /**
   * P1: Hard cap on the number of memory entries injected into context.
   * Beyond this limit, only the highest-importance entries are kept.
   * Default: 20 (matching Claude Code's approach of capping memory to prevent
   * context explosion).
   */
  maxMemoryEntries?: number;
}

export interface ContextBuildInput {
  userInput?: string;
  memories?: MemoryEntry[];
  memoryManager?: MemoryManager;
  skills?: SkillRegistry;
  tools?: ToolRegistry;
  activeSkill?: string; // 按需加载的技能名
  identityOverride?: string;
  personalContext?: { soul?: string; telos?: string };
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

const DEFAULT_IDENTITY = MASTER_AGENT_SYSTEM_PROMPT;

/**
 * P2: Explicit boundary marker separating the cacheable static prefix
 * from the per-turn dynamic suffix. Matches Claude Code's pattern of
 * using a distinct, searchable constant for prompt cache breakpoints.
 */
export const PROMPT_CACHE_BOUNDARY =
  "\n\n--- CONTEXT (dynamic, below this line is per-turn) ---\n\n";

const DEFAULT_OPTIONS: Required<ContextOptions> = {
  maxTokens: DEFAULT_TOKEN_BUDGET,
  summaryThreshold: 20,
  mode: "normal",
  enableTokenTruncation: true,
  toolResultMaxBytes: 4096,
  maxToolResultTotalBytes: 60000,
  maxMemoryEntries: 20,
};

export class ContextBuilder {
  constructor(private identity: string = DEFAULT_IDENTITY) {}

  /**
   * P3: Compute a SHA-256 hash of the current static context prefix.
   * This hash changes when skills, tools, or identity change — enabling
   * cache invalidation in the LLM provider layer. Matching Maka's
   * RequestShapeComponents pattern.
   */
  hash(cacheHint?: { skills?: SkillRegistry; tools?: ToolRegistry }): string {
    const parts: string[] = [this.identity];

    if (cacheHint?.skills) {
      const skillNames = cacheHint.skills
        .list()
        .map((s) => `${s.name}:${s.permission ?? "safe"}`)
        .sort()
        .join(",");
      parts.push(`skills:${skillNames}`);
    }

    if (cacheHint?.tools) {
      const toolNames = cacheHint.tools
        .list()
        .map((t) => `${t.name}:${t.permission ?? "safe"}`)
        .sort()
        .join(",");
      parts.push(`tools:${toolNames}`);
    }

    parts.push(`boundary:${PROMPT_CACHE_BOUNDARY}`);

    return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
  }

  async build(input: ContextBuildInput = {}): Promise<BuiltContext> {
    const opts = { ...DEFAULT_OPTIONS, ...input.options };

    // --- 1. 静态缓存前缀 (Static Stable Prefix) ---
    // 必须保持绝不动摇的顺序以命中 LLM Prompt Cache：Identity -> SOUL/TELOS -> Skills 概览 -> Tools 概览
    const staticBlocks: string[] = [];

    const identity = input.identityOverride ?? this.identity;
    staticBlocks.push(identity);

    if (input.personalContext?.soul) {
      staticBlocks.push(input.personalContext.soul);
    }
    if (input.personalContext?.telos) {
      staticBlocks.push(input.personalContext.telos);
    }

    // Slim skill list — same principle as tools: function-calling schema carries descriptions.
    let skillsBlock = "【可用技能】\n（无）";
    if (input.skills) {
      const skillList = input.skills.list();
      if (skillList.length > 0) {
        const names = skillList.map((s) => `- ${s.name} [${s.permission ?? "safe"}]`).join("\n");
        skillsBlock = `【可用技能 (${skillList.length} 个)】\n${names}`;
      }
    }
    staticBlocks.push(skillsBlock);

    // P3: Slim tool list grouped by semantic kind (Grok Build pattern).
    // Function-calling schema carries full descriptions in the API call.
    let toolsBlock = "【可用工具】\n（无）";
    if (input.tools) {
      const list = input.tools.list();
      if (list.length > 0) {
        // Group by kind, fallback to "other" for untyped tools
        const groups = new Map<string, { name: string; perm: string }[]>();
        const KIND_LABEL: Record<string, string> = {
          read: "Read",
          write: "Write",
          delete: "Delete",
          shell: "Shell",
          calc: "Calc",
          search: "Search",
          work: "Work",
          meta: "Meta",
          other: "Other",
        };
        for (const t of list) {
          const k = t.kind || "other";
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push({ name: t.name, perm: t.permission ?? "safe" });
        }
        const lines = [`【可用工具 (${list.length} 个)】`];
        for (const [kind, tools] of groups) {
          const label = KIND_LABEL[kind] || kind;
          lines.push(`${label}: ${tools.map((t) => `\`${t.name}\``).join(", ")}`);
        }
        toolsBlock = lines.join("\n");
      }
    }
    staticBlocks.push(toolsBlock);

    // Sub-agent dispatch guide — keep it minimal
    if (input.tools && input.tools.get("delegate_subagent")) {
      staticBlocks.push(
        "【子 Agent 派发】复杂调研/对比分析/深度排查时可调用 delegate_subagent。简单问题直接回答。"
      );
    }

    // --- 2. 动态变动区域 (Dynamic Region) ---
    // 置于固定边界之后：系统本地时间 -> 激活的 Skill 详情 -> 探索限制 -> 相关记忆 -> 对话历史
    const dynamicBlocks: string[] = [];

    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timeStr = now.toLocaleString("zh-CN", {
      hour12: false,
      dateStyle: "full",
      timeStyle: "medium",
    });
    dynamicBlocks.push(
      `【当前系统本地时间】\n${timeStr} (时区: ${timeZone})\n当用户询问“几点了”、“今天几号”或基于当前时间计算时，请直接参考此时间。`
    );

    if (input.activeSkill && input.skills) {
      const full = await input.skills.getFullSkill(input.activeSkill);
      if (full) {
        const activeText = `【激活技能：${input.activeSkill}】\n${full.instructions}\n\n请严格按照以上指令完成任务。`;
        dynamicBlocks.push(activeText);
      }
    }

    // Exploration guard: prevent infinite directory traversal.
    // Placed BEFORE memories/history so it's the last behavioral rule the model sees.
    dynamicBlocks.push(
      '【探索限制】当你执行 "分析项目"、"了解架构" 等探索性任务时：' +
        "list_dir/read_file 等数据收集工具最多使用 4-5 轮。" +
        "之后必须停止收集新数据，基于已获取的信息直接输出结构化分析结论。" +
        "禁止递归遍历每一个子目录。相信你已经收集了足够的信息。"
    );

    // H4.2: RAG 动态语义记忆检索装配
    let effectiveMemories = input.memories ? [...input.memories] : [];
    if (input.memoryManager && input.userInput) {
      const ragMatches = input.memoryManager.searchSemanticMemories(input.userInput, {
        topK: 5,
        minScore: 0.25,
      });
      const existingIds = new Set(effectiveMemories.map((m) => m.id));
      for (const m of ragMatches) {
        if (!existingIds.has(m.id)) {
          effectiveMemories.push(m);
        }
      }
    }

    let memoriesBlock: string | undefined;
    if (effectiveMemories.length > 0) {
      // P1: Apply hard cap — keep only top N highest-importance memories
      const capped = [...effectiveMemories]
        .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
        .slice(0, opts.maxMemoryEntries);

      if (capped.length < effectiveMemories.length) {
        console.warn(
          `[ContextBuilder] Memory entries capped: ${capped.length}/${effectiveMemories.length} kept (limit: ${opts.maxMemoryEntries})`
        );
      }

      memoriesBlock =
        "以下是与当前对话相关的记忆，请在回答时参考：\n" +
        capped.map((m) => `- (${m.layer}) ${m.content}`).join("\n");
      dynamicBlocks.push(memoriesBlock);
    }

    let historySummary: string | undefined;
    if (input.history && input.history.length > 0) {
      const historyBlock = this.buildHistoryBlock(input.history, opts);
      dynamicBlocks.push(historyBlock);
      historySummary = historyBlock;
    }

    // 组合 System Prompt
    const staticPart = staticBlocks.join("\n\n");
    const dynamicPart = dynamicBlocks.join("\n\n");

    let systemPrompt = dynamicPart
      ? `${staticPart}${PROMPT_CACHE_BOUNDARY}${dynamicPart}`
      : staticPart;

    // --- 3. Prompt Cache 友好的 Tail-only (尾部截断) ---
    if (opts.enableTokenTruncation && input.tokenEstimator) {
      systemPrompt = this.truncateToTokenBudget(
        staticPart,
        dynamicBlocks,
        opts.maxTokens,
        input.tokenEstimator
      );
    }

    if (input.tokenEstimator) {
      let tokenCount = input.tokenEstimator(systemPrompt);
      let ratio = (tokenCount / opts.maxTokens) * 100;

      console.log(
        `[ContextBuilder] Token 使用: ${tokenCount}/${opts.maxTokens} (${ratio.toFixed(1)}%) | 模式: ${opts.mode}`
      );

      // Layer 3: Structural compaction at 95%+ — deterministic cut of old messages
      if (ratio > 95 && input.history && input.history.length > 10) {
        // Save reference to the OLD history block before replacing it
        const oldHistoryBlock = historySummary;
        const compacted = this.compactHistoryBlock(input.history, opts, input.tokenEstimator);

        // Find and replace the history block in dynamic blocks
        const histIdx = oldHistoryBlock ? dynamicBlocks.indexOf(oldHistoryBlock) : -1;
        if (histIdx >= 0) {
          dynamicBlocks[histIdx] = compacted;
          historySummary = compacted;
          systemPrompt = buildPrompt(dynamicBlocks);
          tokenCount = input.tokenEstimator(systemPrompt);
          ratio = (tokenCount / opts.maxTokens) * 100;

          console.log(
            `[ContextBuilder] Post-compaction: ${tokenCount}/${opts.maxTokens} (${ratio.toFixed(1)}%)`
          );
        }
      }

      // Layer 2: Context pressure injection at 85%+
      if (ratio > 85) {
        const pressureNote =
          "\n\n⚠️ 【上下文预算警告】当前上下文已使用 " +
          `${ratio.toFixed(0)}% (${tokenCount}/${opts.maxTokens} tokens)。` +
          "请立即停止探索和读取新文件，基于已收集的信息给出结论。如果还需要更多信息，简要说明需要什么，不要继续读取文件。";

        systemPrompt = systemPrompt + pressureNote;

        console.warn(
          `[ContextBuilder] High token usage (${ratio.toFixed(1)}%) — injected context pressure note`
        );
      }
    }

    // Local helper for rebuilding prompt from dynamic blocks
    function buildPrompt(dynamics: string[]) {
      return dynamics.length > 0
        ? `${staticPart}${PROMPT_CACHE_BOUNDARY}${dynamics.join("\n\n")}`
        : staticPart;
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
    const sanitizedHistory = history.map((m) =>
      this.sanitizeMessageContent(m, opts.toolResultMaxBytes)
    );

    // Layer 1: Apply aggregate tool result budget
    const trimmed = this.applyToolResultBudget(sanitizedHistory, opts.maxToolResultTotalBytes);

    if (trimmed.length <= opts.summaryThreshold) {
      return `【对话历史】\n${this.formatRecentMessages(trimmed)}`;
    }

    const summary = this.summarizeHistory(trimmed, opts.mode);
    const recent = this.formatRecentMessages(trimmed.slice(-10));

    return `【对话摘要】\n${summary}\n\n【最近消息】\n${recent}`;
  }

  /**
   * Layer 1: Cap the total byte size of tool result messages in history.
   * When the aggregate exceeds the budget, oldest tool results are replaced
   * with terse placeholders so the model knows a tool was called but doesn't
   * see the stale output. Recent messages (last 10) are always preserved.
   */
  private applyToolResultBudget(messages: Message[], maxTotalBytes: number): Message[] {
    if (messages.length === 0) return messages;

    const RECENT_PRESERVE = 10; // always keep last N messages intact

    // Find tool result messages outside the preserved tail
    const toolResultIndices: number[] = [];
    let totalBytes = 0;

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === "tool" && m.content) {
        const bytes = Buffer.byteLength(
          typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          "utf-8"
        );
        totalBytes += bytes;
        if (i < messages.length - RECENT_PRESERVE) {
          toolResultIndices.push(i);
        }
      }
    }

    if (totalBytes <= maxTotalBytes) return messages;

    // Trim from oldest to newest until under budget
    const result = [...messages];
    let trimmedCount = 0;

    for (const idx of toolResultIndices) {
      if (totalBytes <= maxTotalBytes) break;

      const m = result[idx];
      const contentStr = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      const removed = Buffer.byteLength(contentStr, "utf-8");

      result[idx] = {
        ...m,
        content: `[Earlier tool result for ${m.name ?? "tool"}: content trimmed (${removed} bytes) to stay within context budget]`,
      };

      totalBytes -= removed;
      trimmedCount++;
    }

    if (trimmedCount > 0) {
      console.warn(
        `[ContextBuilder] Tool result budget exceeded: trimmed ${trimmedCount} old tool result(s) (total: ${totalBytes}/${maxTotalBytes} bytes)`
      );
    }

    return result;
  }

  /**
   * Layer 3: Structural compaction using Pi's cut-point algorithm.
   * Walks backward from newest messages, keeps most recent ~keepTokens
   * worth of history. Old span is replaced with a structured placeholder.
   * Never cuts at tool results — always at user/assistant boundaries.
   */
  private compactHistoryBlock(
    history: Message[],
    opts: Required<ContextOptions>,
    estimator: (text: string) => number
  ): string {
    const keepTokens = 6000;
    const TOOL_RESULT_ESTIMATE = 500; // rough token estimate per tool result

    // Walk backward, accumulate tokens until we've kept enough
    const kept: Message[] = [];
    let accumulatedTokens = 0;

    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const contentStr =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const est =
        msg.role === "tool" ? TOOL_RESULT_ESTIMATE : estimator(`${msg.role}: ${contentStr}`);

      if (accumulatedTokens + est > keepTokens && kept.length > 3) {
        // Reached budget — cut here, but never at a tool result
        if (msg.role === "tool") {
          // Include this tool result (it belongs to its tool call above)
          kept.unshift(msg);
        }
        break;
      }

      accumulatedTokens += est;
      kept.unshift(msg);
    }

    const cutCount = history.length - kept.length;
    if (cutCount <= 0) return this.formatRecentMessages(kept);

    console.warn(
      `[ContextBuilder] Structural compaction: dropped ${cutCount} oldest messages, keeping ${kept.length} (${accumulatedTokens} est. tokens)`
    );

    // P2: Structured summary of the dropped span — extract what we can deterministically
    const dropped = history.slice(0, cutCount);
    const userMsgs = dropped.filter((m) => m.role === "user");
    const toolCalls = dropped.filter((m) => m.role === "tool");
    const toolNames = [...new Set(toolCalls.map((m) => m.name).filter(Boolean))];
    const userQuestions = userMsgs
      .slice(-3)
      .map((m) => (typeof m.content === "string" ? m.content.slice(0, 100) : ""))
      .filter(Boolean);

    // P3: Post-compaction state re-injection — extract files that were explored
    // so the agent doesn't re-read them after compaction (Claude Code pattern)
    const exploredFiles = this.extractExploredFiles(dropped);
    const exploredSection =
      exploredFiles.length > 0
        ? `\n\n【压缩前已探索的文件 (${exploredFiles.length} 个) — 不需要重新读取】\n` +
          exploredFiles
            .map(
              (f) =>
                `- ${f.path} (${f.tool}, ${f.lines ?? f.entries} ${f.lines ? "lines" : "entries"})`
            )
            .join("\n")
        : "";

    const placeholder = [
      `【对话压缩摘要】前面 ${cutCount} 条消息已被压缩以节省上下文。`,
      `- 用户消息: ${userMsgs.length} 条`,
      `- 工具调用: ${toolCalls.length} 次`,
      toolNames.length > 0 ? `- 使用过的工具: ${toolNames.join(", ")}` : "",
      userQuestions.length > 0
        ? `- 最近用户提问: ${userQuestions.map((q) => `"${q}${q.length >= 100 ? "…" : ""}"`).join("；")}`
        : "",
      exploredSection,
      "",
      `【最近消息 (${kept.length} 条)】`,
      this.formatRecentMessages(kept),
    ]
      .filter((l) => l !== "")
      .join("\n");

    return placeholder;
  }

  /**
   * P3: Extract files explored in the dropped message span.
   * Scans tool result messages for read_file and list_dir, extracting
   * the file/directory path and a brief summary (line count or entry count).
   * Used to re-inject state after compaction so the agent knows what was already explored.
   */
  private extractExploredFiles(
    messages: Message[]
  ): Array<{ path: string; tool: string; lines?: number; entries?: number }> {
    const files: Array<{ path: string; tool: string; lines?: number; entries?: number }> = [];
    const seen = new Set<string>();

    for (const m of messages) {
      if (m.role !== "tool") continue;
      const toolName = m.name || "";
      const content = typeof m.content === "string" ? m.content : "";

      if (toolName === "read_file" || toolName === "read") {
        // Extract path from args or content
        const pathMatch =
          content.match(/\[文件(?:不存在|不是文件)\]\s+(.+)/) ||
          content.match(/\[二进制文件\]\s+(\S+)/) ||
          content.match(/\[Read (.+?) \(/) ||
          content.match(/Read (.+?) \(/);
        const path = pathMatch?.[1] || "unknown";
        if (seen.has(path)) continue;
        seen.add(path);

        const lineCount = parseInt(content.match(/(\d+) lines?/)?.[1] || "0", 10) || undefined;
        const sizeMatch = content.match(/(\d+) lines/);
        files.push({
          path,
          tool: "read_file",
          lines: sizeMatch ? parseInt(sizeMatch[1], 10) : lineCount,
        });
      } else if (toolName === "list_dir" || toolName === "list_directory") {
        // Extract directory path from result
        const dirMatch =
          content.match(/Directory (.+?) /) ||
          content.match(/^(.+?)\s*\(/) ||
          content.match(/Listed \d+ entries in (.+)/);
        const path = dirMatch?.[1] || "unknown";
        if (seen.has(path)) continue;
        seen.add(path);

        const entryCount = parseInt(content.match(/(\d+) entries?/)?.[1] || "0", 10) || undefined;
        files.push({ path, tool: "list_dir", entries: entryCount });
      }
    }

    // Cap at 15 files to avoid bloating the compacted block
    return files.slice(-15);
  }

  private sanitizeMessageContent(m: Message, maxBytes: number): Message {
    if (!m.content) return m;

    let contentStr =
      typeof m.content === "string"
        ? m.content
        : m.content.map((part) => (typeof part === "string" ? part : "[content]")).join("");

    if (contentStr.length > maxBytes) {
      const truncatedCount = contentStr.length - 400;
      contentStr = `${contentStr.slice(0, 200)}\n\n[...工具输出超限已截断 ${truncatedCount} 字符...]\n\n${contentStr.slice(-200)}`;
    }

    return { ...m, content: contentStr };
  }

  private formatRecentMessages(messages: Message[]): string {
    return messages
      .map((m) => {
        const contentStr = typeof m.content === "string" ? m.content : "[content]";
        return `${m.role}: ${contentStr}`;
      })
      .join("\n");
  }

  private summarizeHistory(history: Message[], mode: "fast" | "normal" | "thoughtful"): string {
    if (history.length === 0) return "（无对话历史）";

    const recent = history.slice(-40);

    if (mode === "fast") {
      return recent
        .slice(-8)
        .map((m) => {
          const contentStr =
            typeof m.content === "string"
              ? m.content
              : m.content.map((part) => (typeof part === "string" ? part : "[content]")).join("");
          return `${m.role === "user" ? "用户" : "助手"}: ${contentStr.substring(0, 80)}${contentStr.length > 80 ? "..." : ""}`;
        })
        .join(" | ");
    }

    const userInputs = recent
      .filter((m) => m.role === "user")
      .slice(-6)
      .map((m) => (typeof m.content === "string" ? m.content : "[complex content]"));

    const assistantResponses = recent
      .filter((m) => m.role === "assistant")
      .slice(-6)
      .map((m) => (typeof m.content === "string" ? m.content : "[complex content]"));

    let summary = `对话轮次：${recent.length}\n`;

    if (userInputs.length > 0) {
      summary += `用户主要意图：${userInputs.join("；")}\n`;
    }

    if (assistantResponses.length > 0) {
      summary += `助手关键回复摘要：${assistantResponses
        .map((r) => r.substring(0, 120))
        .join(" | ")}\n`;
    }

    if (mode === "thoughtful" && recent.length > 15) {
      summary += `\n长期关注点：用户似乎在开发 AI 助理项目（hachimi）。`;
    }

    return summary.trim();
  }

  /**
   * Prompt Cache 友好的 Tail-only (尾部截断) 算法
   * 绝对不破坏静态 Prefix 区块，只对 Dynamic Blocks（历史消息 / 记忆）末尾进行修剪
   */
  private truncateToTokenBudget(
    staticPart: string,
    dynamicBlocks: string[],
    maxTokens: number,
    estimator: (text: string) => number
  ): string {
    const buildPrompt = (dynamics: string[]) =>
      dynamics.length > 0
        ? `${staticPart}${PROMPT_CACHE_BOUNDARY}${dynamics.join("\n\n")}`
        : staticPart;

    let currentPrompt = buildPrompt(dynamicBlocks);
    let tokens = estimator(currentPrompt);

    if (tokens <= maxTokens) return currentPrompt;

    console.warn(
      `[ContextBuilder] Prompt 超过 Token 限制 (${tokens} > ${maxTokens})，正在执行 Prompt-Cache 安全的尾部截断...`
    );

    const workingBlocks = [...dynamicBlocks];

    // 从动态区块的最末端/较老数据开始逐块或逐行从尾部裁剪，绝不动前缀
    while (tokens > maxTokens && workingBlocks.length > 0) {
      const lastBlockIdx = workingBlocks.length - 1;
      const lastBlock = workingBlocks[lastBlockIdx];
      const lines = lastBlock.split("\n");

      if (lines.length > 2) {
        // 从长历史块末尾修剪 2 行
        lines.splice(Math.max(1, lines.length - 3), 2);
        workingBlocks[lastBlockIdx] = lines.join("\n");
      } else {
        // 弹出最旧的动态 Block
        workingBlocks.pop();
      }

      currentPrompt = buildPrompt(workingBlocks);
      tokens = estimator(currentPrompt);
    }

    return currentPrompt;
  }
}

/**
 * H3.2: 领域知觉结构化截断器 (Domain-Aware Structural Truncator)
 * 针对 Git Diff、文件目录树和 Error Stack Trace 执行结构化保护截断，避免破坏代码语法或丢掉 Head 块信息
 */
export function truncateDomainContent(content: string, maxBytes = 8192): string {
  if (Buffer.byteLength(content, "utf-8") <= maxBytes) {
    return content;
  }

  // 1. Git Diff 结构化截断
  if (content.includes("diff --git") || content.includes("--- a/") || content.includes("+++ b/")) {
    const lines = content.split("\n");
    const diffHeaders = lines.filter(
      (l) => l.startsWith("diff --git") || l.startsWith("--- ") || l.startsWith("+++ ")
    );
    const hunkLines = lines.filter(
      (l) => l.startsWith("@@") || l.startsWith("+") || l.startsWith("-")
    );

    const headHunks = hunkLines.slice(0, 40).join("\n");
    const tailHunks = hunkLines.slice(-20).join("\n");
    return `${diffHeaders.join("\n")}\n${headHunks}\n\n[...Git Diff 超长结构化折叠 (${lines.length} 行)...]\n\n${tailHunks}`;
  }

  // 2. 堆栈日志 Trace 截断
  if (content.includes("Error:") || content.includes("at ") || content.includes("    at ")) {
    const lines = content.split("\n");
    const errorHead = lines.slice(0, 15).join("\n");
    const stackTail = lines.slice(-10).join("\n");
    return `${errorHead}\n\n[...中间调用栈折叠 (${lines.length - 25} 行)...]\n\n${stackTail}`;
  }

  // 3. 通用首尾保留截断 (前 300 字符 + 后 300 字符)
  const total = content.length;
  const head = content.slice(0, 300);
  const tail = content.slice(-300);
  return `${head}\n\n[...工具输出超限已截断 total_chars≈${total}...]\n\n${tail}`;
}
