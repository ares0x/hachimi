import { calculateCostUSD, normalizeUsage, safeParseToolArgs } from "@hachimi/shared";
import type {
  LLMResponse,
  Message,
  ProviderTransport,
  ProviderTransportConfig,
  ToolDefinition,
} from "../../types/index.js";

export interface OpenAICompatibleConfig extends ProviderTransportConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  customHeaders?: Record<string, string>;
  extraParams?: Record<string, unknown>;
}

export class OpenAICompatibleProvider implements ProviderTransport {
  readonly id = "openai-compatible";
  readonly name = "OpenAI Compatible Transport (OpenAI/DeepSeek/Moonshot/Qwen/Proxies)";

  private apiKey: string;
  private baseURL: string;
  private model: string;
  private temperature: number;
  private customHeaders: Record<string, string>;
  private extraParams: Record<string, unknown>;

  /**
   * P2-3: 思考强度写入 OpenAI 兼容 body。
   * - "none": 发 thinking.type=disabled 关闭思考（DeepSeek 文档：与 reasoning_effort 互斥，
   *   同时发会 400；参考 pi ThinkingLevel::Off 的实现）。
   * - 其余值: 透传 reasoning_effort（low/medium/high/max）。
   */
  private applyReasoningEffort(body: Record<string, unknown>, reasoningEffort?: string): void {
    if (!reasoningEffort) return;
    if (reasoningEffort === "none") {
      body.thinking = { type: "disabled" };
    } else {
      body.reasoning_effort = reasoningEffort;
    }
  }

  constructor(config: OpenAICompatibleConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = (config.baseURL || "https://api.openai.com/v1").replace(/\/$/, "");
    this.model = config.model || "gpt-4o-mini";
    this.temperature = config.temperature ?? 0.7;
    this.customHeaders = config.customHeaders || {};
    this.extraParams = config.extraParams || {};
  }

  private formatMessages(messages: Message[]) {
    return messages.map((m) => ({
      role: m.role === "tool" ? "tool" : m.role,
      content: m.content,
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.name ? { name: m.name } : {}),
      ...(m.tool_calls
        ? {
            tool_calls: m.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments:
                  typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
              },
            })),
          }
        : {}),
    }));
  }

  async chat(
    messages: Message[],
    tools: ToolDefinition[] = [],
    overrideConfig?: Partial<ProviderTransportConfig>
  ): Promise<LLMResponse> {
    const model = overrideConfig?.model || this.model;
    const temperature = overrideConfig?.temperature ?? this.temperature;
    const baseURL = (overrideConfig?.baseURL || this.baseURL).replace(/\/$/, "");
    const apiKey = overrideConfig?.apiKey || this.apiKey;
    const customHeaders = { ...this.customHeaders, ...(overrideConfig?.customHeaders || {}) };
    const extraParams = { ...this.extraParams, ...(overrideConfig?.extraParams || {}) };

    const body: any = {
      model,
      messages: this.formatMessages(messages),
      temperature,
      ...extraParams,
    };

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = "auto";
    }
    this.applyReasoningEffort(body, overrideConfig?.reasoningEffort);

    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...customHeaders,
      },
      body: JSON.stringify(body),
      signal: overrideConfig?.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM API Error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as any;
    const choice = data.choices?.[0]?.message;

    if (!choice) {
      throw new Error("Invalid response from LLM API");
    }

    // P2-B8: 采集归一化用量与估算费用
    const usage = data.usage ? normalizeUsage(data.usage) : undefined;
    const usageWithCost = usage ? { ...usage, costUsd: calculateCostUSD(usage, model) } : undefined;

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      return {
        content: choice.content || null,
        usage: usageWithCost,
        tool_calls: choice.tool_calls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === "string"
              ? safeParseToolArgs(tc.function.arguments)
              : (tc.function.arguments ?? {}),
        })),
      };
    }

    return {
      content: choice.content || "",
      usage: usageWithCost,
    };
  }

  async chatStream(
    messages: Message[],
    tools: ToolDefinition[] = [],
    overrideConfig?: Partial<ProviderTransportConfig> | ((chunk: string) => void),
    onChunk?: (chunk: string) => void
  ): Promise<LLMResponse> {
    let actualConfig: Partial<ProviderTransportConfig> | undefined;
    let actualOnChunk: ((chunk: string) => void) | undefined;

    if (typeof overrideConfig === "function") {
      actualOnChunk = overrideConfig;
      if (onChunk && typeof onChunk === "object") {
        actualConfig = onChunk as Partial<ProviderTransportConfig>;
      }
    } else {
      actualConfig = overrideConfig;
      if (typeof onChunk === "function") {
        actualOnChunk = onChunk;
      }
    }

    const model = actualConfig?.model || this.model;
    const temperature = actualConfig?.temperature ?? this.temperature;
    const baseURL = (actualConfig?.baseURL || this.baseURL).replace(/\/$/, "");
    const apiKey = actualConfig?.apiKey || this.apiKey;
    const customHeaders = { ...this.customHeaders, ...(actualConfig?.customHeaders || {}) };
    const extraParams = { ...this.extraParams, ...(actualConfig?.extraParams || {}) };

    const body: any = {
      model,
      messages: this.formatMessages(messages),
      temperature,
      stream: true,
      ...extraParams,
    };

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = "auto";
    }
    this.applyReasoningEffort(body, actualConfig?.reasoningEffort);

    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...customHeaders,
      },
      body: JSON.stringify(body),
      signal: actualConfig?.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM API Error ${res.status}: ${errText}`);
    }

    if (!res.body) {
      return this.chat(messages, tools, actualConfig);
    }

    const reader = (res.body as any).getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedContent = "";
    let accumulatedReasoning = "";
    const toolCallsMap: Record<number, { id: string; name: string; argumentsStr: string }> = {};
    let buffer = "";
    let rawUsage: Record<string, unknown> | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed === "data: [DONE]") continue;

        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.substring(6));
            // P2-B8: OpenAI 兼容流式在最后一个 chunk 返回 usage（DeepSeek/Qwen/Moonshot 同款）
            if (data.usage) {
              rawUsage = data.usage;
            }
            const delta = data.choices?.[0]?.delta;
            if (!delta) continue;

            const reasoningChunk =
              delta.reasoning_content || delta.reasoning || delta.thinking || null;
            if (reasoningChunk) {
              accumulatedReasoning += reasoningChunk;
            }

            if (delta.content) {
              accumulatedContent += delta.content;
              if (actualOnChunk) {
                actualOnChunk(delta.content);
              }
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index ?? 0;
                if (!toolCallsMap[index]) {
                  toolCallsMap[index] = {
                    id: tc.id || "",
                    name: tc.function?.name || "",
                    argumentsStr: tc.function?.arguments || "",
                  };
                } else {
                  if (tc.id) toolCallsMap[index].id = tc.id;
                  if (tc.function?.name) toolCallsMap[index].name += tc.function.name;
                  if (tc.function?.arguments)
                    toolCallsMap[index].argumentsStr += tc.function.arguments;
                }
              }
            }
          } catch {
            /* ignore parse errors on malformed lines */
          }
        }
      }
    }

    const toolCallsList = Object.values(toolCallsMap).map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: safeParseToolArgs(tc.argumentsStr),
    }));

    const usage = rawUsage ? normalizeUsage(rawUsage) : undefined;
    const usageWithCost = usage ? { ...usage, costUsd: calculateCostUSD(usage, model) } : undefined;

    if (toolCallsList.length > 0) {
      return {
        content: accumulatedContent || null,
        reasoning_content: accumulatedReasoning || null,
        usage: usageWithCost,
        tool_calls: toolCallsList,
      };
    }

    return {
      content: accumulatedContent || "",
      reasoning_content: accumulatedReasoning || null,
      usage: usageWithCost,
    };
  }
}
