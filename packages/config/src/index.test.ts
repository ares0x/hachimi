import { describe, it, expect } from "vitest";
import { loadConfig, getActiveProviderConfig } from "./index.js";

describe("Provider-isolated HachimiConfig", () => {
  it("isolates provider configurations per provider ID", () => {
    const config = loadConfig("non-existent-config.json");
    config.llm.activeProvider = "deepseek";
    config.llm.providers.deepseek = {
      apiKey: "sk-deepseek-test",
      model: "deepseek-chat",
    };
    config.llm.providers.openai = {
      apiKey: "sk-openai-test",
      model: "gpt-4o",
    };

    const active1 = getActiveProviderConfig(config);
    expect(active1.provider).toBe("deepseek");
    expect(active1.config.apiKey).toBe("sk-deepseek-test");

    config.llm.activeProvider = "openai";
    const active2 = getActiveProviderConfig(config);
    expect(active2.provider).toBe("openai");
    expect(active2.config.apiKey).toBe("sk-openai-test");
  });
});
