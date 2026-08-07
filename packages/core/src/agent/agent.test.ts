import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NormalizedUsage } from "@hachimi/shared";
import { FileJsonStore } from "@hachimi/storage";
import { describe, expect, it, vi } from "vitest";
import { MemoryManager } from "../memory/manager.js";
import { ToolRegistry } from "../tools/registry.js";
import type { LLMProvider, LLMResponse, Message, ToolDefinition } from "../types/index.js";
import {
  Agent,
  compactMessagesForOverflow,
  isContextOverflowError,
  pruneActiveToolResults,
} from "./agent.js";
import { MockLLMProvider } from "./llm.js";

function makeMsg(role: Message["role"], content: string): Message {
  return { id: `msg_${role}_${content}`, role, content, timestamp: Date.now() };
}

class RecordingProvider implements LLMProvider {
  models: Array<string | undefined> = [];
  reasoningEfforts: Array<string | undefined> = [];

  async chat(
    _messages: Message[],
    _tools?: ToolDefinition[],
    config?: { signal?: AbortSignal } | Record<string, unknown>
  ): Promise<LLMResponse> {
    const cfg = (config ?? {}) as { model?: string; reasoningEffort?: string };
    this.models.push(cfg.model);
    this.reasoningEfforts.push(cfg.reasoningEffort);
    return {
      content: "ok",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 15,
        costUsd: 0.001,
      },
    };
  }
}

/** P1: 可控 usage 的探针 provider — 报告大额真实用量或完全不报用量。 */
class UsageProbeProvider implements LLMProvider {
  constructor(
    private readonly reportUsage: boolean,
    private readonly usageTotalTokens: number
  ) {}

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = Array.isArray(lastUser?.content)
      ? lastUser.content.map((p) => (p.type === "text" ? p.text : "")).join(" ")
      : typeof lastUser?.content === "string"
        ? lastUser.content
        : "";
    const callMatch = text.match(/调用工具\s*([a-zA-Z0-9_-]+)/);
    const usage = this.reportUsage
      ? {
          inputTokens: this.usageTotalTokens,
          outputTokens: 100,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: this.usageTotalTokens + 100,
          costUsd: 0.001,
        }
      : undefined;
    if (callMatch && tools?.some((t) => t.name === callMatch[1])) {
      return {
        content: null,
        tool_calls: [{ id: "call_1", name: callMatch[1], arguments: {} }],
        usage,
      };
    }
    return { content: "我参考了记忆后回答：预算闸门已生效", usage };
  }
}

describe("Agent tool loop", () => {
  it("calculator tool returns numeric result text", async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: "calculator",
      description: "calc",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
          operator: { type: "string" },
        },
        required: ["a", "b", "operator"],
      },
      async execute(args) {
        const { a, b, operator } = args as {
          a: number;
          b: number;
          operator: string;
        };
        if (operator === "+") return String(a + b);
        return "0";
      },
    });

    const memory = new MemoryManager(
      join(process.cwd(), "data-test-agent-memory.json"),
      new FileJsonStore()
    );

    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory,
      maxToolRounds: 3,
    });

    const reply = await agent.run("请计算 1+2");
    expect(reply).toMatch(/3/);
  });

  it("streams response chunks via onChunk callback", async () => {
    const tools = new ToolRegistry();
    const memory = new MemoryManager(
      join(process.cwd(), "data-test-agent-memory.json"),
      new FileJsonStore()
    );

    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory,
    });

    const chunks: string[] = [];
    const reply = await agent.run("你好", [], {
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(reply).toBeDefined();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toBe(reply);
  });

  it("triggers onToolStart and onToolEnd callbacks during tool loop", async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: "calculator",
      description: "calc",
      parameters: {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" }, operator: { type: "string" } },
        required: ["a", "b", "operator"],
      },
      async execute(args: any) {
        return String(args.a + args.b);
      },
    });

    const memory = new MemoryManager(
      join(process.cwd(), "data-test-agent-memory.json"),
      new FileJsonStore()
    );

    let startedTool = "";
    let endedTool = "";

    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory,
      onToolStart: (name) => {
        startedTool = name;
      },
      onToolEnd: (name) => {
        endedTool = name;
      },
    });

    await agent.run("请计算 2+3");
    expect(startedTool).toBe("calculator");
    expect(endedTool).toBe("calculator");
  });

  it("hard-stops the tool loop when the context budget is exceeded (P2.8)", async () => {
    const tools = new ToolRegistry();
    let toolCalls = 0;
    tools.register({
      name: "probe_tool",
      description: "probe",
      parameters: { type: "object", properties: {} },
      async execute() {
        toolCalls++;
        return "probe_result";
      },
    });
    const memory = new MemoryManager(
      join(mkdtempSync(join(tmpdir(), "hachimi-hard-gate-")), "memory.json"),
      new FileJsonStore()
    );
    const agent = new Agent({
      llm: new MockLLMProvider(),
      tools,
      memory,
      maxTokens: 40,
      maxToolRounds: 10,
    });

    const reply = await agent.run("调用工具 probe_tool hello");

    // 闸门触发后不再执行新的工具轮次（round 1 的工具已执行一次）
    expect(toolCalls).toBe(1);
    // 强制最终回答路径（空工具面调用）生效
    expect(reply).toContain("我参考了记忆后回答");
  });

  it("calibrates the hard budget gate with real provider usage (P1)", async () => {
    const tools = new ToolRegistry();
    let toolCalls = 0;
    tools.register({
      name: "probe_tool",
      description: "probe",
      parameters: { type: "object", properties: {} },
      async execute() {
        toolCalls++;
        return "probe_result";
      },
    });
    const memory = new MemoryManager(
      join(mkdtempSync(join(tmpdir(), "hachimi-usage-gate-")), "memory.json"),
      new FileJsonStore()
    );
    const agent = new Agent({
      llm: new UsageProbeProvider(true, 30000),
      tools,
      memory,
      maxTokens: 32000,
      maxToolRounds: 10,
    });

    const reply = await agent.run("调用工具 probe_tool hello");

    // 纯文本估算远低于「窗口 − 保留余量」（~27904），但 provider 实测 usage
    // 高达 30000+，校准后 round 2 即触发闸门 → 不再执行新的工具轮次。
    expect(toolCalls).toBe(1);
    expect(reply).toContain("我参考了记忆后回答");
  });

  it("falls back to text estimation when the provider reports no usage (P1)", async () => {
    const tools = new ToolRegistry();
    let toolCalls = 0;
    tools.register({
      name: "probe_tool",
      description: "probe",
      parameters: { type: "object", properties: {} },
      async execute() {
        toolCalls++;
        return "probe_result";
      },
    });
    const memory = new MemoryManager(
      join(mkdtempSync(join(tmpdir(), "hachimi-est-gate-")), "memory.json"),
      new FileJsonStore()
    );
    const agent = new Agent({
      llm: new UsageProbeProvider(false, 0),
      tools,
      memory,
      maxTokens: 40,
      maxToolRounds: 10,
    });

    const reply = await agent.run("调用工具 probe_tool hello");

    // 无 usage 时回退纯文本估算：round 2 估算超过 40 − 64 → 触发闸门。
    expect(toolCalls).toBe(1);
    expect(reply).toContain("我参考了记忆后回答");
  });

  it("auto-compacts and retries once on provider context overflow (P2)", async () => {
    const tools = new ToolRegistry();
    let toolCalls = 0;
    tools.register({
      name: "probe_tool",
      description: "probe",
      parameters: { type: "object", properties: {} },
      async execute() {
        toolCalls++;
        return "probe_result";
      },
    });

    let calls = 0;
    const provider: LLMProvider = {
      async chat(messages: Message[], toolDefs?: ToolDefinition[]): Promise<LLMResponse> {
        calls++;
        // 第 2 次调用模拟 provider 上下文窗口溢出
        if (calls === 2) {
          throw new Error(
            "This model's maximum context length is 8192 tokens. However, your messages resulted in 12000 tokens. Please reduce the length of the messages."
          );
        }
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const text = Array.isArray(lastUser?.content)
          ? lastUser.content.map((p) => (p.type === "text" ? p.text : "")).join(" ")
          : typeof lastUser?.content === "string"
            ? lastUser.content
            : "";
        if (
          calls === 1 &&
          toolDefs?.some((t) => t.name === "probe_tool") &&
          text.includes("probe_tool")
        ) {
          return {
            content: null,
            tool_calls: [{ id: "call_1", name: "probe_tool", arguments: {} }],
          };
        }
        return { content: "我参考了记忆后回答：溢出压缩重试成功" };
      },
    };

    const memory = new MemoryManager(
      join(mkdtempSync(join(tmpdir(), "hachimi-overflow-")), "memory.json"),
      new FileJsonStore()
    );
    const agent = new Agent({
      llm: provider,
      tools,
      memory,
      maxTokens: 32000,
      maxToolRounds: 10,
    });

    // 长历史撑大上下文，使溢出发生时消息数足够触发压缩
    const history: Message[] = Array.from({ length: 16 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `这是第 ${i} 条历史消息，用于撑大上下文。`)
    );
    const reply = await agent.run("调用工具 probe_tool hello", history);

    // 调用序列：round1 工具调用 → round2 溢出 → 压缩后重试成功
    expect(calls).toBe(3);
    expect(toolCalls).toBe(1);
    expect(reply).toContain("溢出压缩重试成功");
  });

  it("compactMessagesForOverflow keeps system + recent tail without orphan tool results (P2)", () => {
    const messages: Message[] = [makeMsg("system", "SYS"), makeMsg("user", "U1")];
    for (let i = 0; i < 10; i++) {
      messages.push(makeMsg("assistant", `A${i}`));
      messages.push(makeMsg("tool", `R${i}`));
    }

    const compacted = compactMessagesForOverflow(messages);

    expect(compacted).not.toBeNull();
    expect(compacted![0].content).toBe("SYS");
    expect(
      compacted!.some((m) => typeof m.content === "string" && m.content.startsWith("[上下文压缩]"))
    ).toBe(true);
    expect(compacted!.some((m) => m.content === "R9")).toBe(true);
    expect(compacted!.length).toBeLessThan(messages.length);
    // 尾部不以孤儿 tool 结果开头（其 tool_call 已被裁剪）
    expect(compacted!.find((m, idx) => idx > 0 && m.role !== "system")?.role).not.toBe("tool");
  });

  it("compactMessagesForOverflow preserves the last user instruction (P2)", () => {
    const messages: Message[] = [makeMsg("system", "SYS"), makeMsg("user", "U1")];
    for (let i = 0; i < 10; i++) {
      messages.push(makeMsg("assistant", `A${i}`));
      messages.push(makeMsg("tool", `R${i}`));
    }
    messages.push(makeMsg("user", "STEER: 改为只读调研"));
    messages.push(makeMsg("assistant", "A10"));
    for (let i = 0; i < 12; i++) messages.push(makeMsg("tool", `S${i}`));

    const compacted = compactMessagesForOverflow(messages);

    expect(compacted).not.toBeNull();
    expect(compacted!.some((m) => m.content === "STEER: 改为只读调研")).toBe(true);
  });

  it("isContextOverflowError matches provider overflow messages (P2)", () => {
    expect(
      isContextOverflowError(
        new Error(
          "This model's maximum context length is 8192 tokens. Your messages resulted in 12000 tokens."
        )
      )
    ).toBe(true);
    expect(isContextOverflowError(new Error("rate limit exceeded, retry later"))).toBe(false);
    expect(isContextOverflowError("connection reset")).toBe(false);
  });

  it("pruneActiveToolResults trims old oversized tool results, keeping recent tail (P2)", () => {
    const big = "x".repeat(40_000);
    const messages: Message[] = [
      makeMsg("system", "SYS"),
      makeMsg("user", "U1"),
      makeMsg("assistant", "A1"),
      { ...makeMsg("tool", big), name: "read_file", tool_call_id: "call_big" }, // 旧的大结果（应在裁剪区）
      makeMsg("assistant", "A2"),
      makeMsg("tool", "recent-result"),
    ];

    const pruned = pruneActiveToolResults(messages, { maxTotalBytes: 30_000, preserveTail: 2 });

    expect(pruned).toBe(true);
    const oldResult = messages.find((m) => m.content === big);
    expect(oldResult).toBeUndefined();
    expect(
      messages.some((m) => typeof m.content === "string" && m.content.includes("content trimmed"))
    ).toBe(true);
    // 最近尾部保留原文
    expect(messages.some((m) => m.content === "recent-result")).toBe(true);
    // tool_call_id / name 配对字段保留（provider 不报孤儿 tool 消息）
    const trimmed = messages.find(
      (m) => typeof m.content === "string" && m.content.includes("content trimmed")
    );
    expect(trimmed?.role).toBe("tool");
    expect(trimmed?.name).toBe("read_file");
    expect(trimmed?.tool_call_id).toBe("call_big");
  });

  it("pruneActiveToolResults no-ops when results fit the budget (P2)", () => {
    const messages: Message[] = [
      makeMsg("system", "SYS"),
      makeMsg("user", "U1"),
      makeMsg("assistant", "A1"),
      makeMsg("tool", "small-result"),
    ];
    expect(pruneActiveToolResults(messages, { maxTotalBytes: 1000, preserveTail: 0 })).toBe(false);
    expect(messages.some((m) => m.content === "small-result")).toBe(true);
  });
});

describe("Agent usage reporting & auto model routing (P2-B8/B6)", () => {
  function makeMemory() {
    return new MemoryManager(
      join(process.cwd(), "data-test-agent-memory.json"),
      new FileJsonStore()
    );
  }

  it("emits per-call usage via onUsage", async () => {
    const provider = new RecordingProvider();
    const agent = new Agent({
      llm: provider,
      tools: new ToolRegistry(),
      memory: makeMemory(),
      modelId: "deepseek-v4-flash",
    });

    const usages: Array<NormalizedUsage & { costUsd?: number; model?: string }> = [];
    const reply = await agent.run("你好", [], {
      onUsage: (u) => usages.push(u),
    });

    expect(reply).toBe("ok");
    expect(usages.length).toBeGreaterThan(0);
    expect(usages[0].totalTokens).toBe(15);
    expect(usages[0].model).toBe("deepseek-v4-flash");
  });

  it("routes complex requests to the pro model when autoModelRouting is enabled", async () => {
    const provider = new RecordingProvider();
    const agent = new Agent({
      llm: provider,
      tools: new ToolRegistry(),
      memory: makeMemory(),
      modelId: "deepseek-v4-flash",
      availableModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
      autoModelRouting: { enabled: true },
    });

    await agent.run("帮我调试这段代码并修复 bug", []);
    expect(provider.models[0]).toBe("deepseek-v4-pro");
    expect(provider.reasoningEfforts[0]).toBe("high");
  });

  it("keeps the default model when routing is disabled", async () => {
    const provider = new RecordingProvider();
    const agent = new Agent({
      llm: provider,
      tools: new ToolRegistry(),
      memory: makeMemory(),
      modelId: "deepseek-v4-flash",
      availableModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
    });

    await agent.run("帮我调试这段代码并修复 bug", []);
    expect(provider.models[0]).toBe("deepseek-v4-flash"); // 未启用路由 → 保持连接默认模型
  });

  it("passes explicit reasoningEffort through and overrides route result (P2-3)", async () => {
    const provider = new RecordingProvider();
    const agent = new Agent({
      llm: provider,
      tools: new ToolRegistry(),
      memory: makeMemory(),
      modelId: "deepseek-v4-flash",
      availableModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
      autoModelRouting: { enabled: true },
    });

    // 路由会给出 high，但显式 "none" 优先（子代理默认关思考）
    await agent.run("帮我调试这段代码并修复 bug", [], { reasoningEffort: "none" });
    expect(provider.reasoningEfforts[0]).toBe("none");

    // 未显式指定时路由结果生效
    await agent.run("帮我调试这段代码并修复 bug", []);
    expect(provider.reasoningEfforts[1]).toBe("high");
  });

  it("returns partial findings when usage budget exhausts instead of a bare notice (P2-3)", async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: "calculator",
      description: "calc",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
          operator: { type: "string" },
        },
        required: ["a", "b", "operator"],
      },
      async execute(args) {
        const { a, b, operator } = args as { a: number; b: number; operator: string };
        return operator === "+" ? String(a + b) : "0";
      },
    });

    const provider = new UsageProbeProvider(true, 30000);
    const agent = new Agent({
      llm: provider,
      tools,
      memory: makeMemory(),
      modelId: "deepseek-v4-flash",
    });

    // 第一轮触发工具调用（usage 30100 < 35000）→ 工具执行后第二轮累计 60200 ≥ 35000
    // → 预算用尽收尾：空工具面总结轮输出已收集要点，而非一句"预算用尽"。
    const reply = await agent.run("调用工具 calculator", [], {
      usageBudget: { maxTokens: 35000 },
    });

    expect(reply).toContain("预算闸门已生效");
    expect(reply).not.toContain("预算用尽");
  });

  it("auto-compacts middle tool records at the soft threshold (P2.9)", async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: "calculator",
      description: "calc",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
          operator: { type: "string" },
        },
        required: ["a", "b", "operator"],
      },
      async execute() {
        return "42";
      },
    });

    const provider = new UsageProbeProvider(false, 0);
    const agent = new Agent({
      llm: provider,
      tools,
      memory: makeMemory(),
      modelId: "deepseek-v4-flash",
      maxTokens: 100_000, // 软阈值 75k / 硬阈值 ~96k
      maxToolRounds: 10,
    });

    // 20 条历史：10 条 user 大文本（各 32k chars ≈ 8k tokens → 合计 ≈ 80k tokens）
    // 落在软阈值（75k）与硬阈值（~96k）之间，验证第 4 轮触发归档压缩
    const bigBlock = "y".repeat(32_000);
    const history: Message[] = [];
    for (let i = 0; i < 20; i++) {
      history.push(
        i % 2 === 0
          ? { id: `m_hist_${i}`, role: "user", content: `历史问题 ${i}\n${bigBlock}`, timestamp: i }
          : { id: `m_hist_${i}`, role: "assistant", content: `历史回答 ${i}`, timestamp: i }
      );
    }

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const reply = await agent.run("调用工具 calculator", history);
      expect(reply).toBeTruthy();
      expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("Auto-compact"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("exposes the model context window for external budget readers (P2.9)", () => {
    const agent = new Agent({
      llm: new UsageProbeProvider(false, 0),
      tools: new ToolRegistry(),
      memory: makeMemory(),
      modelId: "deepseek-v4-flash",
      maxTokens: 128_000,
    });
    expect(agent.contextWindowTokens).toBe(128_000);
  });

  it("summarizes session history with the active model (P2.9)", async () => {
    const provider = new RecordingProvider();
    const agent = new Agent({
      llm: provider,
      tools: new ToolRegistry(),
      memory: makeMemory(),
      modelId: "deepseek-v4-flash",
    });

    const summary = await agent.summarizeMessages([
      makeMsg("user", "分析 A 方案"),
      makeMsg("assistant", "已读取文件并得出结论"),
      {
        ...makeMsg("assistant", ""),
        tool_calls: [{ id: "c1", name: "read_file", arguments: {} }],
      },
      makeMsg("tool", "文件内容..."),
    ]);

    expect(summary).toBe("ok"); // RecordingProvider 固定返回
    expect(provider.reasoningEfforts).toHaveLength(1); // 确实触发了一次 LLM 调用
  });
});

describe("Agent incognito mode (P1: per-Work no-memory)", () => {
  function makeIsolatedMemory() {
    const file = join(
      process.cwd(),
      `data-test-agent-incognito-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );
    const memory = new MemoryManager(file, new FileJsonStore());
    return { memory, file };
  }

  it("skips session memory and blocks save_memory in incognito", async () => {
    const { memory, file } = makeIsolatedMemory();
    try {
      const agent = new Agent({
        llm: new MockLLMProvider(),
        tools: new ToolRegistry(),
        memory,
      });

      // 普通对话：session 记忆不写入
      await agent.run("你好，今天天气不错", [], { incognito: true });
      expect(memory.list("session")).toHaveLength(0);
      expect(memory.list("long_term")).toHaveLength(0);

      // 自然语言「请记住」：直接跳过
      const reply = await agent.run("请记住我喜欢喝手冲咖啡", [], { incognito: true });
      expect(reply).toContain("无痕模式");
      expect(memory.list("long_term")).toHaveLength(0);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it("writes memory normally when incognito is off", async () => {
    const { memory, file } = makeIsolatedMemory();
    try {
      const agent = new Agent({
        llm: new MockLLMProvider(),
        tools: new ToolRegistry(),
        memory,
      });

      await agent.run("你好，今天天气不错", [], {});
      expect(memory.list("session").length).toBeGreaterThan(0);

      await agent.run("请记住我喜欢喝手冲咖啡", [], {});
      expect(memory.list("long_term").length).toBeGreaterThan(0);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it("blocks the save_memory tool during the tool loop in incognito", async () => {
    const { memory, file } = makeIsolatedMemory();
    const tools = new ToolRegistry();
    let executed = false;
    tools.register({
      name: "save_memory",
      description: "save to long-term memory",
      permission: "safe",
      parameters: {
        type: "object",
        properties: { content: { type: "string" } },
        required: ["content"],
      },
      async execute() {
        executed = true;
        return "saved";
      },
    });

    // Provider: 第一轮返回 save_memory 工具调用，第二轮返回最终内容
    class OneSaveMemoryToolProvider implements LLMProvider {
      private calls = 0;
      async chat(): Promise<LLMResponse> {
        this.calls++;
        if (this.calls === 1) {
          return {
            content: null,
            tool_calls: [
              {
                id: "call_1",
                name: "save_memory",
                arguments: { content: "机密信息" },
              },
            ],
          };
        }
        return { content: "完成" };
      }
    }

    try {
      const agent = new Agent({
        llm: new OneSaveMemoryToolProvider(),
        tools,
        memory,
      });
      const reply = await agent.run("帮我记住一个机密", [], { incognito: true });
      expect(reply).toBe("完成");
      expect(executed).toBe(false); // 工具被拦截，未真正执行
      expect(memory.list("long_term")).toHaveLength(0);
    } finally {
      rmSync(file, { force: true });
    }
  });
});
