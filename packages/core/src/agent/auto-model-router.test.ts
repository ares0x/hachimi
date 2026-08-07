import { describe, expect, it } from "vitest";
import { classifyRequestComplexity, resolveAutoModelRoute } from "./auto-model-router.js";

describe("classifyRequestComplexity (P2-B6)", () => {
  it("classifies small talk as simple", () => {
    expect(classifyRequestComplexity("你好")).toBe("simple");
    expect(classifyRequestComplexity("hello")).toBe("simple");
    expect(classifyRequestComplexity("谢谢")).toBe("simple");
  });

  it("classifies code/debug requests as complex", () => {
    expect(classifyRequestComplexity("帮我调试一下这段代码")).toBe("complex");
    expect(classifyRequestComplexity("修复这个 bug")).toBe("complex");
    expect(classifyRequestComplexity("```ts\nconst x = 1\n```")).toBe("complex");
    expect(classifyRequestComplexity("重构 src/agent/agent.ts 的循环逻辑")).toBe("complex");
  });

  it("biases toward complex with heavy tool usage and long history", () => {
    expect(
      classifyRequestComplexity("继续", {
        recentTools: ["run_command", "read_file"],
        historyLength: 50,
      })
    ).toBe("complex");
  });

  it("returns ambiguous for short neutral requests", () => {
    expect(classifyRequestComplexity("继续")).toBe("ambiguous");
  });
});

describe("resolveAutoModelRoute (P2-B6)", () => {
  const base = {
    availableModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
    defaultModelId: "deepseek-v4-flash",
    config: { enabled: true },
  };

  it("routes complex requests to the pro tier", () => {
    const route = resolveAutoModelRoute({
      ...base,
      prompt: "调试这段代码并修复性能问题",
    });
    expect(route.tier).toBe("pro");
    expect(route.modelId).toBe("deepseek-v4-pro");
    expect(route.reasoningEffort).toBe("high");
  });

  it("routes simple requests to the fast tier", () => {
    const route = resolveAutoModelRoute({ ...base, prompt: "你好" });
    expect(route.tier).toBe("fast");
    expect(route.modelId).toBe("deepseek-v4-flash");
    expect(route.reasoningEffort).toBeUndefined();
  });

  it("keeps the default model on ambiguous requests (no-op routing)", () => {
    const route = resolveAutoModelRoute({ ...base, prompt: "继续" });
    expect(route.modelId).toBe("deepseek-v4-flash");
  });

  it("honors explicit fast/pro model ids over keyword matching", () => {
    const route = resolveAutoModelRoute({
      ...base,
      prompt: "重构模块并修复测试失败",
      config: { enabled: true, fastModelId: "x-fast", proModelId: "y-pro" },
    });
    expect(route.modelId).toBe("y-pro");
  });

  it("falls back to the default model when no tier match exists", () => {
    const route = resolveAutoModelRoute({
      prompt: "帮我调试一下",
      availableModels: ["only-model"],
      defaultModelId: "only-model",
      config: { enabled: true },
    });
    expect(route.modelId).toBe("only-model");
  });

  it("uses configured pro reasoning effort", () => {
    const route = resolveAutoModelRoute({
      ...base,
      prompt: "修复崩溃问题",
      config: { enabled: true, proReasoningEffort: "medium" },
    });
    expect(route.reasoningEffort).toBe("medium");
  });
});

describe("resolveAutoModelRoute vision routing (model eyes)", () => {
  it("routes image contexts to a vision model when available", () => {
    const route = resolveAutoModelRoute({
      prompt: "这张图里有什么？",
      hasImages: true,
      availableModels: ["deepseek-v4-flash", "gpt-4o-mini"],
      defaultModelId: "deepseek-v4-flash",
      config: { enabled: true },
    });
    expect(route.modelId).toBe("gpt-4o-mini");
  });

  it("keeps the default model when no vision model is available", () => {
    const route = resolveAutoModelRoute({
      prompt: "这张图里有什么？",
      hasImages: true,
      availableModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
      defaultModelId: "deepseek-v4-flash",
      config: { enabled: true },
    });
    expect(route.modelId).toBe("deepseek-v4-flash");
  });

  it("respects visionRouting=false (vision companion handles images)", () => {
    const route = resolveAutoModelRoute({
      prompt: "这张图里有什么？",
      hasImages: true,
      visionRouting: false,
      availableModels: ["deepseek-v4-flash", "gpt-4o-mini"],
      defaultModelId: "deepseek-v4-flash",
      config: { enabled: true },
    });
    expect(route.modelId).toBe("deepseek-v4-flash");
  });

  it("does not reroute text-only contexts", () => {
    const route = resolveAutoModelRoute({
      prompt: "你好",
      hasImages: false,
      availableModels: ["deepseek-v4-flash", "gpt-4o-mini"],
      defaultModelId: "deepseek-v4-flash",
      config: { enabled: true },
    });
    expect(route.modelId).toBe("deepseek-v4-flash");
  });
});
