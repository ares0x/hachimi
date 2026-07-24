import type { Message, ToolDefinition, LLMResponse, ProviderTransport, ProviderTransportConfig } from "../../types/index.js";

export interface AnthropicConfig extends ProviderTransportConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  customHeaders?: Record<string, string>;
}

export class AnthropicProviderTransport implements ProviderTransport {
  readonly id = "anthropic";
  readonly name = "Anthropic Transport (Claude 3.5 Sonnet / Claude 3.7 Thinking)";

  private apiKey: string;
  private baseURL: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private customHeaders: Record<string, string>;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = (config.baseURL || "https://api.anthropic.com/v1").replace(/\/$/, "");
    this.model = config.model || "claude-3-5-sonnet-20241022";
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 4096;
    this.customHeaders = config.customHeaders || {};
  }

  private formatMessages(messages: Message[]) {
    let systemPrompt = "";
    const anthropicMessages: any[] = [];

    for (const m of messages) {
      if (m.role === "system") {
        const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        systemPrompt += (systemPrompt ? "\n\n" : "") + text;
      } else if (m.role === "user") {
        const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        anthropicMessages.push({ role: "user", content: text });
      } else if (m.role === "assistant") {
        const contentParts: any[] = [];
        if (m.content) {
          contentParts.push({ type: "text", text: String(m.content) });
        }
        if (m.tool_calls && m.tool_calls.length > 0) {
          for (const tc of m.tool_calls) {
            contentParts.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }
        }
        anthropicMessages.push({
          role: "assistant",
          content: contentParts.length > 0 ? contentParts : String(m.content || ""),
        });
      } else if (m.role === "tool") {
        anthropicMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.tool_call_id,
              content: m.content,
            },
          ],
        });
      }
    }

    return { systemPrompt, anthropicMessages };
  }

  private formatTools(tools: ToolDefinition[]) {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  async chat(
    messages: Message[],
    tools: ToolDefinition[] = [],
    overrideConfig?: Partial<ProviderTransportConfig>
  ): Promise<LLMResponse> {
    const model = overrideConfig?.model || this.model;
    const temperature = overrideConfig?.temperature ?? this.temperature;
    const maxTokens = overrideConfig?.maxTokens ?? this.maxTokens;
    const baseURL = (overrideConfig?.baseURL || this.baseURL).replace(/\/$/, "");
    const apiKey = overrideConfig?.apiKey || this.apiKey;
    const customHeaders = { ...this.customHeaders, ...(overrideConfig?.customHeaders || {}) };

    const { systemPrompt, anthropicMessages } = this.formatMessages(messages);

    const body: any = {
      model,
      max_tokens: maxTokens,
      messages: anthropicMessages,
      temperature,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (tools.length > 0) {
      body.tools = this.formatTools(tools);
    }

    const res = await fetch(`${baseURL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...customHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API Error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    let textContent = "";
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === "text") {
          textContent += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input || {},
          });
        }
      }
    }

    if (toolCalls.length > 0) {
      return {
        content: textContent || null,
        tool_calls: toolCalls,
      };
    }

    return {
      content: textContent,
    };
  }

  async chatStream(
    messages: Message[],
    tools: ToolDefinition[] = [],
    overrideConfig?: Partial<ProviderTransportConfig> | ((chunk: string) => void),
    onChunk?: (chunk: string) => void
  ): Promise<LLMResponse> {
    let actualConfig: Partial<ProviderTransportConfig> | undefined;
    let actualOnChunk: ((chunk: string) => void) | undefined = onChunk;

    if (typeof overrideConfig === "function") {
      actualOnChunk = overrideConfig;
      actualConfig = undefined;
    } else {
      actualConfig = overrideConfig;
    }

    const model = actualConfig?.model || this.model;
    const temperature = actualConfig?.temperature ?? this.temperature;
    const maxTokens = actualConfig?.maxTokens ?? this.maxTokens;
    const baseURL = (actualConfig?.baseURL || this.baseURL).replace(/\/$/, "");
    const apiKey = actualConfig?.apiKey || this.apiKey;
    const customHeaders = { ...this.customHeaders, ...(actualConfig?.customHeaders || {}) };

    const { systemPrompt, anthropicMessages } = this.formatMessages(messages);

    const body: any = {
      model,
      max_tokens: maxTokens,
      messages: anthropicMessages,
      temperature,
      stream: true,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (tools.length > 0) {
      body.tools = this.formatTools(tools);
    }

    const res = await fetch(`${baseURL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...customHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API Error ${res.status}: ${errText}`);
    }

    if (!res.body) {
      return this.chat(messages, tools, actualConfig);
    }

    const reader = (res.body as any).getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedContent = "";
    const toolCallsMap: Record<number, { id: string; name: string; argumentsStr: string }> = {};
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const eventDataStr = trimmed.substring(6);
        try {
          const event = JSON.parse(eventDataStr);
          if (event.type === "content_block_delta") {
            if (event.delta?.type === "text_delta" && event.delta.text) {
              accumulatedContent += event.delta.text;
              if (actualOnChunk) {
                actualOnChunk(event.delta.text);
              }
            } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
              const idx = event.index ?? 0;
              if (toolCallsMap[idx]) {
                toolCallsMap[idx].argumentsStr += event.delta.partial_json;
              }
            }
          } else if (event.type === "content_block_start") {
            if (event.content_block?.type === "tool_use") {
              const idx = event.index ?? 0;
              toolCallsMap[idx] = {
                id: event.content_block.id || "",
                name: event.content_block.name || "",
                argumentsStr: "",
              };
            }
          }
        } catch {
          /* ignore SSE parse errors */
        }
      }
    }

    const toolCallsList = Object.values(toolCallsMap).map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: JSON.parse(tc.argumentsStr || "{}"),
    }));

    if (toolCallsList.length > 0) {
      return {
        content: accumulatedContent || null,
        tool_calls: toolCallsList,
      };
    }

    return {
      content: accumulatedContent,
    };
  }
}
