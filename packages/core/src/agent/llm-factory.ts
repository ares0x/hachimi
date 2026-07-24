// packages/core/src/agent/llm-factory.ts
import { getActiveProviderConfig, type HachimiConfig } from "@hachimi/config";
import { log } from "@hachimi/shared";
import type { LLMProvider } from "../types/index.js";
import { MockLLMProvider } from "./llm.js";
import { ProviderRegistry } from "./providers/transport.js";

/**
 * 根据 HachimiConfig 配置工厂化创建 LLMProvider / ProviderTransport 实例
 */
export function createLLMFromConfig(config: HachimiConfig): LLMProvider {
  const { provider, config: pConfig } = getActiveProviderConfig(config);

  if (provider === "mock") {
    log("info", "使用 MockLLMProvider");
    return new MockLLMProvider();
  }

  const apiKey = pConfig.apiKey;
  if (!apiKey) {
    log("warn", `未找到 ${provider} 的 API_KEY，回退到 MockLLMProvider`);
    return new MockLLMProvider();
  }

  log("info", `通过 ProviderRegistry 初始化模型传输层: [${provider}]`, {
    model: pConfig.model,
    baseURL: pConfig.baseURL,
  });

  return ProviderRegistry.create(provider, {
    apiKey,
    model: pConfig.model,
    baseURL: pConfig.baseURL,
    customHeaders: pConfig.customHeaders,
    extraParams: pConfig.extraParams,
  });
}
