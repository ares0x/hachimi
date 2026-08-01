// packages/core/src/agent/llm-factory.ts
import {
  resolveLlmSelection,
  getDefaultCredentialStore,
  type HachimiConfig,
} from "@hachimi/config";
import { log } from "@hachimi/shared";
import type { LLMProvider } from "../types/index.js";
import { MockLLMProvider } from "./llm.js";
import { ProviderRegistry } from "./providers/transport.js";

/**
 * Create an LLMProvider from HachimiConfig.
 * Uses the new connection-based path: resolveLlmSelection → CredentialStore → ProviderRegistry.
 */
export function createLLMFromConfig(config: HachimiConfig): LLMProvider {
  const selection = resolveLlmSelection(config);
  const credStore = getDefaultCredentialStore();

  if (selection.providerType === "mock") {
    log("info", "Using MockLLMProvider");
    return new MockLLMProvider();
  }

  // API key: credential store first, then connection field, then env
  const apiKey =
    credStore.get(selection.connectionId) ||
    selection.connection?.apiKey;

  if (!apiKey) {
    log("warn", `No API key for connection '${selection.connectionId}', falling back to MockLLMProvider`);
    return new MockLLMProvider();
  }

  log("info", `Initializing LLM transport via ProviderRegistry: [${selection.providerType}]`, {
    model: selection.modelId,
    baseURL: selection.connection?.baseUrl,
    connectionId: selection.connectionId,
  });

  return ProviderRegistry.create(selection.providerType, {
    apiKey,
    model: selection.modelId,
    baseURL: selection.connection?.baseUrl,
  });
}
