import { loadConfig } from "@hachimi/config";
import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "./llm.js";
import { createLLMForConnection } from "./llm-factory.js";
import { DeepSeekResponsesProvider } from "./providers/deepseek-responses.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.js";

function makeConfig(serverWebSearch: boolean) {
  const config = loadConfig("non-existent-config.json");
  config.llm.connections = {
    deepseek: {
      id: "deepseek",
      name: "DeepSeek",
      providerType: "deepseek",
      enabled: true,
      defaultModelId: "deepseek-v4-flash",
      models: ["deepseek-v4-flash"],
      enabledModels: ["deepseek-v4-flash"],
      apiKey: "sk-test",
      serverWebSearch,
    },
  };
  return config;
}

describe("createLLMForConnection", () => {
  it("selects DeepSeekResponsesProvider when serverWebSearch is enabled", () => {
    const provider = createLLMForConnection(makeConfig(true), "deepseek");
    expect(provider).toBeInstanceOf(DeepSeekResponsesProvider);
  });

  it("keeps OpenAICompatibleProvider when serverWebSearch is off", () => {
    const provider = createLLMForConnection(makeConfig(false), "deepseek");
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("returns null when the connection has no API key", () => {
    const config = makeConfig(true);
    config.llm.connections!["deepseek-nokey"] = {
      id: "deepseek-nokey",
      name: "DeepSeek No Key",
      providerType: "deepseek",
      enabled: true,
      defaultModelId: "deepseek-v4-flash",
      models: ["deepseek-v4-flash"],
      enabledModels: ["deepseek-v4-flash"],
      serverWebSearch: true,
    };
    expect(createLLMForConnection(config, "deepseek-nokey")).toBeNull();
  });

  it("returns a Mock provider for mock connections", () => {
    const config = makeConfig(false);
    config.llm.connections!.mock = {
      id: "mock",
      name: "Mock",
      providerType: "mock",
      enabled: true,
      defaultModelId: "mock-model",
      models: [],
      enabledModels: [],
    };
    expect(createLLMForConnection(config, "mock")).toBeInstanceOf(MockLLMProvider);
  });
});
