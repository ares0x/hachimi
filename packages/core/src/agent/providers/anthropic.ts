import { calculateCostUSD, normalizeUsage, safeParseToolArgs } from "@hachimi/shared";

/**
 * Convert a data URL image into an Anthropic image source block.
 * Pure helper (sync) so the conversion is directly testable.
 */
export function dataUrlToAnthropicImage(
  url: string
): { type: "image"; source: { type: "base64"; media_type: string; data: string } } | null {
  if (!url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const meta = url.slice(5, comma);
  const mediaMatch = meta.match(/^([\w.+-]+\/[\w.+-]+)/);
  const mediaType = mediaMatch ? mediaMatch[1] : "image/png";
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: url.slice(comma + 1) },
  };
}

/**
 * Convert a data URL (or http(s) URL) image into an Anthropic image source
 * block. The Anthropic API only accepts base64 image sources; remote URLs are
 * fetched server-side and inlined.
 */
async function toAnthropicImage(
  url: string
): Promise<{ type: "image"; source: { type: "base64"; media_type: string; data: string } } | null> {
  const fromDataUrl = dataUrlToAnthropicImage(url);
  if (fromDataUrl) return fromDataUrl;
  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: res.headers.get("content-type") || "image/png",
        data: buf.toString("base64"),
      },
    };
  } catch {
    return null;
  }
}

/** Format a single user message content into Anthropic content blocks. */
async function formatUserContent(content: Message["content"]): Promise<any> {
  if (typeof content === "string") return content;
  const blocks: any[] = [];
  for (const part of content) {
    if (part.type === "text") {
      blocks.push({ type: "text", text: part.text });
    } else if (part.type === "image_url") {
      const image = await toAnthropicImage(part.image_url.url);
      if (image) blocks.push(image);
    }
    // tool_call / tool_result parts are not valid inside user content here.
  }
  return blocks.length > 0 ? blocks : "";
}

import type {
  LLMResponse,
  Message,
  ProviderTransport,
  ProviderTransportConfig,
  ToolDefinition,
} from "../../types/index.js";

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

  private async formatMessages(messages: Message[]) {
    let systemPrompt = "";
    const anthropicMessages: any[] = [];

    for (const m of messages) {
      if (m.role === "system") {
        const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        systemPrompt += (systemPrompt ? "\n\n" : "") + text;
      } else if (m.role === "user") {
        anthropicMessages.push({ role: "user", content: await formatUserContent(m.content) });
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

    const { systemPrompt, anthropicMessages } = await this.formatMessages(messages);

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
      signal: overrideConfig?.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API Error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as any;
    let textContent = "";
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];

    // P2-B8: Anthropic 非流式 usage 采集
    const usage = data.usage ? normalizeUsage(data.usage) : undefined;
    const usageWithCost = usage ? { ...usage, costUsd: calculateCostUSD(usage, model) } : undefined;

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
        usage: usageWithCost,
        tool_calls: toolCalls,
      };
    }

    return {
      content: textContent,
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
    const maxTokens = actualConfig?.maxTokens ?? this.maxTokens;
    const baseURL = (actualConfig?.baseURL || this.baseURL).replace(/\/$/, "");
    const apiKey = actualConfig?.apiKey || this.apiKey;
    const customHeaders = { ...this.customHeaders, ...(actualConfig?.customHeaders || {}) };

    const { systemPrompt, anthropicMessages } = await this.formatMessages(messages);

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
      signal: actualConfig?.signal,
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
    // P2-B8: Anthropic 流式 usage 分散在 message_start(input) 与 message_delta(output)
    const rawUsage: Record<string, unknown> = {};

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
          if (event.type === "message_start" && event.message?.usage) {
            for (const [k, v] of Object.entries(event.message.usage)) {
              rawUsage[k] = v;
            }
          } else if (event.type === "message_delta" && event.usage) {
            for (const [k, v] of Object.entries(event.usage)) {
              rawUsage[k] = (rawUsage[k] as number) + Number(v);
            }
          } else if (event.type === "content_block_delta") {
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
      arguments: safeParseToolArgs(tc.argumentsStr),
    }));

    const usage = Object.keys(rawUsage).length > 0 ? normalizeUsage(rawUsage) : undefined;
    const usageWithCost = usage ? { ...usage, costUsd: calculateCostUSD(usage, model) } : undefined;

    if (toolCallsList.length > 0) {
      return {
        content: accumulatedContent || null,
        usage: usageWithCost,
        tool_calls: toolCallsList,
      };
    }

    return {
      content: accumulatedContent,
      usage: usageWithCost,
    };
  }
}
