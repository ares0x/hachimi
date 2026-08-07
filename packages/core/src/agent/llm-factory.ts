// packages/core/src/agent/llm-factory.ts
import {
  getDefaultCredentialStore,
  type HachimiConfig,
  resolveLlmSelection,
} from "@hachimi/config";
import { log } from "@hachimi/shared";
import type { LLMProvider } from "../types/index.js";
import { MockLLMProvider } from "./llm.js";
import { AcpClientProvider } from "./providers/acp.js";
import { DeepSeekResponsesProvider } from "./providers/deepseek-responses.js";
import { ProviderRegistry } from "./providers/transport.js";

/**
 * Create an LLMProvider for an arbitrary connection (vision companion,
 * per-session overrides, tests). Returns null when the connection is missing
 * or has no usable API key.
 */
export function createLLMForConnection(
  config: HachimiConfig,
  connectionId: string,
  modelId?: string
): LLMProvider | null {
  const conn = config.llm.connections?.[connectionId];
  if (!conn) {
    log("warn", `createLLMForConnection: unknown connection '${connectionId}'`);
    return null;
  }

  if (conn.providerType === "mock") {
    return new MockLLMProvider();
  }

  // ACP connections drive an external agent process over stdio JSON-RPC and
  // need no API key — the external agent holds its own credentials.
  const credStore = getDefaultCredentialStore();
  const apiKey = credStore.get(connectionId) || conn.apiKey;

  if (conn.providerType !== "acp" && !apiKey) {
    log("warn", `No API key for connection '${connectionId}', provider not created`);
    return null;
  }

  const resolvedApiKey = apiKey || "";

  if (conn.providerType === "acp") {
    log("info", `Initializing ACP client transport: [${conn.command || conn.baseUrl}]`, {
      command: conn.command || conn.baseUrl,
      commandArgs: conn.commandArgs,
      cwd: conn.cwd,
      connectionId,
    });
    return new AcpClientProvider({
      apiKey: resolvedApiKey,
      model: modelId || conn.defaultModelId,
      baseURL: conn.baseUrl,
      command: conn.command,
      commandArgs: conn.commandArgs,
      cwd: conn.cwd,
      autoApprovePermissions: conn.autoApprovePermissions,
      separateSession: conn.separateSession,
    });
  }

  log("info", `Initializing LLM transport via ProviderRegistry: [${conn.providerType}]`, {
    model: modelId || conn.defaultModelId,
    baseURL: conn.baseUrl,
    connectionId,
  });

  // DeepSeek 官方连接开启服务端联网搜索时，切换到 Responses API 传输层：
  // 由 DeepSeek 在服务端执行 web_search（模型直接拿到结果作答），
  // 同时抑制本地内置 web_search 工具，避免双重搜索。
  if (conn.serverWebSearch && conn.providerType === "deepseek") {
    log("info", "DeepSeek server-side web_search enabled, using Responses transport", {
      connectionId,
    });
    return new DeepSeekResponsesProvider({
      apiKey: resolvedApiKey,
      model: modelId || conn.defaultModelId,
      baseURL: conn.baseUrl,
    });
  }

  return ProviderRegistry.create(conn.providerType, {
    apiKey: resolvedApiKey,
    model: modelId || conn.defaultModelId,
    baseURL: conn.baseUrl,
  });
}

/**
 * Create an LLMProvider from HachimiConfig.
 * Uses the new connection-based path: resolveLlmSelection → CredentialStore → ProviderRegistry.
 */
export function createLLMFromConfig(config: HachimiConfig): LLMProvider {
  const selection = resolveLlmSelection(config);

  if (selection.providerType === "mock") {
    log("info", "Using MockLLMProvider");
    return new MockLLMProvider();
  }

  return (
    createLLMForConnection(config, selection.connectionId, selection.modelId) ??
    new MockLLMProvider()
  );
}
