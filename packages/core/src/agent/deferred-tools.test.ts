// packages/core/src/agent/deferred-tools.test.ts
//
// P2.3 延迟工具注入：
// - 启用后首轮只公布核心未分组工具（分组工具不进入 provider 列表）
// - load_tools 的 [addedToolNames:] 协议同轮扩展工具集
// - 关闭时行为不变（全量公布）
import { join } from "node:path";
import { FileJsonStore } from "@hachimi/storage";
import { describe, expect, it } from "vitest";
import { MemoryManager } from "../memory/manager.js";
import { registerBuiltinTools } from "../tools/builtin/index.js";
import { ToolRegistry } from "../tools/registry.js";
import type { LLMProvider, LLMResponse, Message, ToolDefinition } from "../types/index.js";
import { Agent } from "./agent.js";

function makeMemory() {
  return new MemoryManager(
    join(process.cwd(), "data-test-deferred-memory.json"),
    new FileJsonStore()
  );
}

/** 捕获每次 LLM 调用收到的 toolDefs */
class CapturingProvider implements LLMProvider {
  toolDefsSeen: ToolDefinition[][] = [];
  script: Array<() => Promise<LLMResponse>> = [];

  async chat(_messages: Message[], tools: ToolDefinition[] = []): Promise<LLMResponse> {
    this.toolDefsSeen.push(tools);
    const next = this.script.shift();
    if (next) return await next();
    return { content: "done" };
  }
  async chatStream(messages: Message[], tools: ToolDefinition[]): Promise<LLMResponse> {
    return this.chat(messages, tools);
  }
}

function makeRegistry() {
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);
  return registry;
}

describe("P2.3 deferred tool injection", () => {
  it("advertises only core ungrouped tools on the first turn", async () => {
    const provider = new CapturingProvider();
    const agent = new Agent({
      llm: provider,
      tools: makeRegistry(),
      memory: makeMemory(),
      deferredToolInjection: true,
      maxToolRounds: 2,
    });

    await agent.run("你好", [], {});

    const first = provider.toolDefsSeen[0] ?? [];
    const names = first.map((t) => t.name);
    expect(names).toContain("read_file"); // 核心未分组
    expect(names).toContain("load_tools"); // 始终公布（发现工具组）
    expect(names).not.toContain("web_search"); // search 分组工具延迟
    expect(names).not.toContain("git_status"); // git 分组工具延迟
  });

  it("expands the tool set same-turn via load_tools addedToolNames protocol", async () => {
    const provider = new CapturingProvider();
    // 第 1 轮：调用 load_tools(search)；第 2 轮：结束
    provider.script.push(async () => ({
      content: null,
      tool_calls: [{ id: "call_load", name: "load_tools", arguments: { group: "search" } }],
    }));
    const agent = new Agent({
      llm: provider,
      tools: makeRegistry(),
      memory: makeMemory(),
      deferredToolInjection: true,
      maxToolRounds: 3,
    });

    await agent.run("搜索一下天气", [], {});

    expect(provider.toolDefsSeen.length).toBeGreaterThanOrEqual(2);
    const first = provider.toolDefsSeen[0].map((t) => t.name);
    expect(first).not.toContain("web_search");

    const second = provider.toolDefsSeen[1].map((t) => t.name);
    expect(second).toContain("web_search"); // addedToolNames 同轮扩展
  });

  it("keeps full advertisement when deferred injection is disabled", async () => {
    const provider = new CapturingProvider();
    const agent = new Agent({
      llm: provider,
      tools: makeRegistry(),
      memory: makeMemory(),
      deferredToolInjection: false,
      maxToolRounds: 2,
    });

    await agent.run("你好", [], {});

    const first = provider.toolDefsSeen[0] ?? [];
    expect(first.map((t) => t.name)).toContain("web_search");
    expect(first.map((t) => t.name)).toContain("git_status");
  });
});
