import { join } from "node:path";
import type { HachimiConfig } from "@hachimi/config";
import { FileJsonStore } from "@hachimi/storage";
import { describe, expect, it } from "vitest";
import { MemoryManager } from "../memory/manager.js";
import { ToolRegistry } from "../tools/registry.js";
import type {
  LLMProvider,
  LLMResponse,
  Message,
  RuntimeAttachment,
  ToolDefinition,
} from "../types/index.js";
import { VisionCompanion } from "../vision/companion.js";
import { registerToolImage } from "../vision/index.js";
import { Agent } from "./agent.js";

class CapturingProvider implements LLMProvider {
  captured: Message[][] = [];

  async chat(messages: Message[], _tools?: ToolDefinition[]): Promise<LLMResponse> {
    this.captured.push(messages);
    return { content: "ok" };
  }
}

class FakeVisionProvider implements LLMProvider {
  calls = 0;

  async chat(messages: Message[], _tools?: ToolDefinition[]): Promise<LLMResponse> {
    this.calls += 1;
    for (const m of messages) {
      if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === "image_url") return { content: "vision saw image" };
        }
      }
    }
    return { content: "vision saw no image" };
  }
}

function makeConfig(): HachimiConfig {
  return {
    llm: {
      connections: {
        openai: {
          id: "openai",
          name: "OpenAI",
          providerType: "openai",
          enabled: true,
          apiKey: "sk-oa",
          defaultModelId: "gpt-4o",
          models: ["gpt-4o"],
          enabledModels: ["gpt-4o"],
        },
      },
    },
    paths: { dataDir: "./data", memoryFile: "./data/memory.json", sessionsDir: "./data/sessions" },
    agent: { maxToolRounds: 5 },
    context: {
      maxTokens: 12000,
      summaryThreshold: 8,
      defaultMode: "normal",
      enableTokenTruncation: true,
    },
    tui: { theme: "dark", title: "test" },
  };
}

const ATTACHMENT: RuntimeAttachment = {
  id: "a1",
  mimeType: "image/png",
  dataBase64: "AAAA",
};

function lastUserMessage(captured: Message[][]): Message {
  const messages = captured[0];
  return [...messages].reverse().find((m) => m.role === "user")!;
}

describe("Agent vision attachments (model eyes)", () => {
  it("delivers image_url parts to the LLM when the active model has vision", async () => {
    const provider = new CapturingProvider();
    const memory = new MemoryManager(
      join(process.cwd(), "data-test-vision-attach.json"),
      new FileJsonStore()
    );
    const agent = new Agent({
      llm: provider,
      tools: new ToolRegistry(),
      memory,
      modelId: "gpt-4o",
      modelHasVision: true,
    });

    await agent.run("这张图里有什么？", [], { attachments: [ATTACHMENT] });

    const userMsg = lastUserMessage(provider.captured);
    expect(Array.isArray(userMsg.content)).toBe(true);
    if (Array.isArray(userMsg.content)) {
      const imageParts = userMsg.content.filter((p) => p.type === "image_url");
      expect(imageParts).toHaveLength(1);
    }
  });

  it("replaces image parts with vision-companion text for non-vision models", async () => {
    const main = new CapturingProvider();
    const visionProvider = new FakeVisionProvider();
    const companion = new VisionCompanion({
      config: makeConfig(),
      getProvider: () => visionProvider,
    });
    const memory = new MemoryManager(
      join(process.cwd(), "data-test-vision-attach.json"),
      new FileJsonStore()
    );
    const agent = new Agent({
      llm: main,
      tools: new ToolRegistry(),
      memory,
      modelId: "deepseek-v4-flash",
      visionCompanion: companion,
    });

    let companionInfo: any;
    await agent.run("这张图里有什么？", [], {
      attachments: [ATTACHMENT],
      onVisionCompanionCall: (info) => {
        companionInfo = info;
      },
    });

    expect(visionProvider.calls).toBe(1);
    expect(companionInfo).toMatchObject({ model: "gpt-4o", imageCount: 1 });

    const userMsg = lastUserMessage(main.captured);
    expect(Array.isArray(userMsg.content)).toBe(true);
    if (Array.isArray(userMsg.content)) {
      expect(userMsg.content.some((p) => p.type === "image_url")).toBe(false);
      expect(
        userMsg.content.some((p) => p.type === "text" && p.text.includes("vision saw image"))
      ).toBe(true);
    }
  });
});

describe("Agent tool screenshot images", () => {
  it("attaches tool-registered images as user content parts for vision models", async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: "fake_screenshot",
      description: "fake",
      permission: "safe",
      parameters: {
        type: "object",
        properties: { asImage: { type: "boolean" } },
      },
      async execute(args) {
        const asImage = Boolean(args.asImage);
        const base = "[Fake Screenshot] text summary";
        if (!asImage) return base;
        const marker = registerToolImage("data:image/png;base64,AAAA");
        return `${base}\n${marker}`;
      },
    });

    const provider = new CapturingProvider();
    const memory = new MemoryManager(
      join(process.cwd(), "data-test-vision-attach.json"),
      new FileJsonStore()
    );
    const agent = new Agent({
      llm: provider,
      tools,
      memory,
      modelId: "gpt-4o",
      modelHasVision: true,
      maxToolRounds: 2,
    });

    // Mock tool result pipeline: return a tool_call so the loop runs the tool,
    // then a plain answer so the loop ends.
    const toolCallsSeen: string[] = [];
    const origChat = provider.chat.bind(provider);
    provider.chat = async (messages, toolDefs) => {
      const last = messages[messages.length - 1];
      const text =
        typeof last.content === "string"
          ? last.content
          : Array.isArray(last.content)
            ? last.content.map((p) => (p.type === "text" ? p.text : "")).join(" ")
            : "";
      if (toolCallsSeen.length === 0) {
        toolCallsSeen.push(text);
        return {
          content: null,
          tool_calls: [{ id: "call_1", name: "fake_screenshot", arguments: { asImage: true } }],
        };
      }
      return origChat(messages, toolDefs);
    };

    await agent.run("截个图", [], {});

    // The tool ran and the following user message carried the screenshot image.
    const allUserMessages = provider.captured.flatMap((msgs) =>
      msgs.filter((m) => m.role === "user")
    );
    const withImage = allUserMessages.find(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url")
    );
    expect(withImage).toBeDefined();
    expect(toolCallsSeen.length).toBeGreaterThan(0);
  });
});
