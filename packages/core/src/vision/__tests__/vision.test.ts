import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HachimiConfig } from "@hachimi/config";
import { isVisionModelId, pickVisionModel } from "@hachimi/config";
import { describe, expect, it } from "vitest";
import type {
  LLMProvider,
  LLMResponse,
  Message,
  RuntimeAttachment,
  ToolDefinition,
} from "../../types/index.js";
import { attachmentToImagePart } from "../attachments.js";
import { VisionCompanion } from "../companion.js";
import { preprocessVisualContent } from "../preprocess.js";

function makeConfig(llm: HachimiConfig["llm"]): HachimiConfig {
  return {
    llm,
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

const DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function text(msg: string): Message {
  return {
    id: "m1",
    role: "user",
    content: [{ type: "text", text: msg }],
    timestamp: Date.now(),
  };
}

function withImage(msg: string, url = DATA_URL): Message {
  return {
    id: "m1",
    role: "user",
    content: [
      { type: "text", text: msg },
      { type: "image_url", image_url: { url } },
    ],
    timestamp: Date.now(),
  };
}

class FakeVisionProvider implements LLMProvider {
  calls = 0;
  seenImageUrls: string[] = [];

  async chat(messages: Message[], _tools?: ToolDefinition[]): Promise<LLMResponse> {
    this.calls += 1;
    for (const m of messages) {
      if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === "image_url") this.seenImageUrls.push(part.image_url.url);
        }
      }
    }
    return {
      content: "图片里有一个红色按钮，右上角有文字「确定」",
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

describe("vision capability helpers (config)", () => {
  it("detects vision models from catalog + keyword hints", () => {
    expect(isVisionModelId("gpt-4o")).toBe(true);
    expect(isVisionModelId("claude-3-7-sonnet")).toBe(true);
    expect(isVisionModelId("qwen-vl-plus")).toBe(true);
    expect(isVisionModelId("deepseek-v4-flash")).toBe(false);
    expect(isVisionModelId("deepseek-chat")).toBe(false);
  });

  it("respects explicit connection-level overrides", () => {
    expect(isVisionModelId("deepseek-chat", { supportsVision: true })).toBe(true);
    expect(isVisionModelId("gpt-4o", { supportsVision: false })).toBe(false);
  });

  it("picks the first vision model from enabled models", () => {
    const conn = {
      defaultModelId: "deepseek-chat",
      enabledModels: ["deepseek-chat", "gpt-4o-mini"],
      models: ["deepseek-chat", "gpt-4o-mini"],
    };
    expect(pickVisionModel(conn)).toBe("gpt-4o-mini");
  });
});

describe("attachmentToImagePart", () => {
  it("builds a data URL part from base64", () => {
    const part = attachmentToImagePart({
      id: "a1",
      mimeType: "image/png",
      dataBase64: "AAAA",
    } as RuntimeAttachment);
    expect(part).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } });
  });

  it("passes remote URLs through", () => {
    const part = attachmentToImagePart({
      id: "a2",
      mimeType: "image/png",
      url: "https://example.com/x.png",
    } as RuntimeAttachment);
    expect(part).toEqual({ type: "image_url", image_url: { url: "https://example.com/x.png" } });
  });

  it("reads local file paths at runtime", () => {
    const file = join(tmpdir(), `hachimi-vision-test-${Date.now()}.png`);
    writeFileSync(file, "fake-png");
    const part = attachmentToImagePart({ id: "a3", mimeType: "image/png", filePath: file });
    expect(part?.type).toBe("image_url");
    if (part?.type === "image_url") {
      expect(part.image_url.url.startsWith("data:image/png;base64,")).toBe(true);
    }
  });

  it("returns null for invalid attachments", () => {
    expect(
      attachmentToImagePart({ id: "x", mimeType: "image/png" } as RuntimeAttachment)
    ).toBeNull();
    expect(
      attachmentToImagePart({ id: "y", mimeType: "image/png", filePath: "/nonexistent/x.png" })
    ).toBeNull();
  });
});

describe("VisionCompanion", () => {
  it("resolves a vision-capable connection automatically", () => {
    const companion = new VisionCompanion({
      config: makeConfig({
        activeConnectionId: "deepseek",
        connections: {
          deepseek: {
            id: "deepseek",
            name: "DeepSeek",
            providerType: "deepseek",
            enabled: true,
            apiKey: "sk-ds",
            defaultModelId: "deepseek-v4-flash",
            models: ["deepseek-v4-flash"],
            enabledModels: ["deepseek-v4-flash"],
          },
          openai: {
            id: "openai",
            name: "OpenAI",
            providerType: "openai",
            enabled: true,
            apiKey: "sk-oa",
            defaultModelId: "gpt-4o",
            models: ["gpt-4o", "gpt-4o-mini"],
            enabledModels: ["gpt-4o", "gpt-4o-mini"],
          },
        },
      }),
      getProvider: () => new FakeVisionProvider(),
    });
    expect(companion.isConfigured()).toBe(true);
    expect(companion.resolve()).toEqual({ connectionId: "openai", modelId: "gpt-4o" });
  });

  it("is not configured when no vision-capable connection exists", () => {
    const companion = new VisionCompanion({
      config: makeConfig({
        activeConnectionId: "deepseek",
        connections: {
          deepseek: {
            id: "deepseek",
            name: "DeepSeek",
            providerType: "deepseek",
            enabled: true,
            apiKey: "sk-ds",
            defaultModelId: "deepseek-chat",
            models: ["deepseek-chat"],
            enabledModels: ["deepseek-chat"],
          },
        },
      }),
    });
    expect(companion.isConfigured()).toBe(false);
  });

  it("describes images via the companion model and caches per image hash", async () => {
    const provider = new FakeVisionProvider();
    const companion = new VisionCompanion({
      config: makeConfig({
        activeConnectionId: "deepseek",
        connections: {
          deepseek: {
            id: "deepseek",
            name: "DeepSeek",
            providerType: "deepseek",
            enabled: true,
            apiKey: "sk-ds",
            defaultModelId: "deepseek-chat",
            models: ["deepseek-chat"],
            enabledModels: ["deepseek-chat"],
          },
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
      }),
      getProvider: () => provider,
    });

    const first = await companion.describeImage({ dataUrl: DATA_URL });
    expect(first?.description).toContain("红色按钮");
    expect(first?.cached).toBe(false);
    expect(provider.calls).toBe(1);
    expect(provider.seenImageUrls).toEqual([DATA_URL]);

    const second = await companion.describeImage({ dataUrl: DATA_URL });
    expect(second?.description).toBe(first?.description);
    expect(second?.cached).toBe(true);
    expect(provider.calls).toBe(1);
  });

  it("returns null when the companion connection has no usable key", async () => {
    const companion = new VisionCompanion({
      config: makeConfig({
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
      }),
      getProvider: () => null,
    });
    expect(companion.isConfigured()).toBe(true);
    expect(await companion.describeImage({ dataUrl: DATA_URL })).toBeNull();
  });
});

describe("preprocessVisualContent", () => {
  it("leaves messages untouched when there are no images", async () => {
    const messages = [text("你好")];
    const degraded: number[] = [];
    await preprocessVisualContent(messages, {
      modelId: "deepseek-chat",
      onDegraded: (n) => degraded.push(n),
    });
    expect(messages[0].content).toEqual([{ type: "text", text: "你好" }]);
    expect(degraded).toEqual([]);
  });

  it("passes images through when the active model has vision", async () => {
    const messages = [withImage("看图")];
    const onCompanionCall = () => {
      throw new Error("should not call companion");
    };
    await preprocessVisualContent(messages, {
      modelId: "gpt-4o",
      onCompanionCall,
    });
    expect(Array.isArray(messages[0].content)).toBe(true);
    if (Array.isArray(messages[0].content)) {
      expect(messages[0].content.some((p) => p.type === "image_url")).toBe(true);
    }
  });

  it("replaces images with companion descriptions for non-vision models", async () => {
    const provider = new FakeVisionProvider();
    const companion = new VisionCompanion({
      config: makeConfig({
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
      }),
      getProvider: () => provider,
    });

    const messages = [withImage("这张图里有什么？")];
    let callInfo: any;
    await preprocessVisualContent(messages, {
      modelId: "deepseek-v4-flash",
      companion,
      onCompanionCall: (info) => {
        callInfo = info;
      },
    });

    expect(provider.calls).toBe(1);
    expect(callInfo.imageCount).toBe(1);
    expect(callInfo.cacheHits).toBe(0);
    expect(Array.isArray(messages[0].content)).toBe(true);
    if (Array.isArray(messages[0].content)) {
      const descPart = messages[0].content.find(
        (p) => p.type === "text" && p.text.includes("Image description")
      );
      expect(descPart).toBeDefined();
      if (descPart && descPart.type === "text") expect(descPart.text).toContain("红色按钮");
    }
  });

  it("degrades to an explicit notice when no vision path exists", async () => {
    const messages = [withImage("图")];
    const degraded: number[] = [];
    await preprocessVisualContent(messages, {
      modelId: "deepseek-v4-flash",
      onDegraded: (n) => degraded.push(n),
    });
    expect(degraded).toEqual([1]);
    expect(Array.isArray(messages[0].content)).toBe(true);
    if (Array.isArray(messages[0].content)) {
      expect(
        messages[0].content.some((p) => p.type === "text" && p.text.includes("Image omitted"))
      ).toBe(true);
    }
  });

  it("reuses the visionDescription persisted on the message metadata", async () => {
    const provider = new FakeVisionProvider();
    const companion = new VisionCompanion({
      config: makeConfig({
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
      }),
      getProvider: () => provider,
    });

    const message = withImage("图");
    message.metadata = { visionDescription: "已有描述" };
    const messages = [message];
    let cacheHits = -1;
    await preprocessVisualContent(messages, {
      modelId: "deepseek-chat",
      companion,
      onCompanionCall: (info) => {
        cacheHits = info.cacheHits;
      },
    });

    expect(provider.calls).toBe(0);
    expect(cacheHits).toBe(1);
    if (Array.isArray(messages[0].content)) {
      const descPart = messages[0].content.find(
        (p) => p.type === "text" && p.text.includes("已有描述")
      );
      expect(descPart).toBeDefined();
    }
  });
});
