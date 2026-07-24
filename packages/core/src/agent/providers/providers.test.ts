import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "./transport.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { AnthropicProviderTransport } from "./anthropic.js";

describe("ProviderRegistry and ProviderTransports", () => {
  it("creates OpenAICompatibleProvider for openai, deepseek, moonshot, qwen", () => {
    const p1 = ProviderRegistry.create("deepseek", { apiKey: "test-key" });
    expect(p1).toBeInstanceOf(OpenAICompatibleProvider);

    const p2 = ProviderRegistry.create("moonshot", { apiKey: "test-key" });
    expect(p2).toBeInstanceOf(OpenAICompatibleProvider);

    const p3 = ProviderRegistry.create("qwen", { apiKey: "test-key" });
    expect(p3).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("creates AnthropicProviderTransport for anthropic / claude", () => {
    const p1 = ProviderRegistry.create("anthropic", { apiKey: "test-key" });
    expect(p1).toBeInstanceOf(AnthropicProviderTransport);

    const p2 = ProviderRegistry.create("claude", { apiKey: "test-key" });
    expect(p2).toBeInstanceOf(AnthropicProviderTransport);
  });
});
