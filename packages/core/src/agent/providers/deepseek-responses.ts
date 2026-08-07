// DeepSeek Responses API transport — enables provider-executed web_search
// (server-side search) for official DeepSeek connections. The model provider
// runs the search and injects results into the same response, so the harness
// never executes a second local web search. Server tool activity is surfaced
// through onServerToolStart/onServerToolEnd so the tool timeline stays intact.

import { calculateCostUSD, normalizeUsage, safeParseToolArgs } from "@hachimi/shared";
import type {
  ContentPart,
  LLMResponse,
  Message,
  ProviderTransport,
  ProviderTransportConfig,
  ToolCall,
  ToolDefinition,
} from "../../types/index.js";

export interface DeepSeekResponsesConfig extends ProviderTransportConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  customHeaders?: Record<string, string>;
  extraParams?: Record<string, unknown>;
}

/** Synthetic timeline name for provider-executed searches (matches builtin web_search). */
export const SERVER_WEB_SEARCH_TOOL = "web_search";

function textOf(part: ContentPart | string): string {
  if (typeof part === "string") return part;
  return part.type === "text" ? part.text : "";
}

/** chat/completions Message[] → Responses API input items (stateless per request). */
function formatInput(messages: Message[]): unknown[] {
  const input: unknown[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      input.push({
        role: "system",
        content: [{ type: "input_text", text: textOf(m.content as ContentPart | string) }],
      });
    } else if (m.role === "user") {
      input.push({
        role: "user",
        content: [{ type: "input_text", text: textOf(m.content as ContentPart | string) }],
      });
    } else if (m.role === "assistant") {
      input.push({
        role: "assistant",
        content: [{ type: "output_text", text: textOf(m.content as ContentPart | string) }],
      });
      for (const tc of m.tool_calls || []) {
        input.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.name,
          arguments:
            typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments ?? {}),
        });
      }
    } else if (m.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: m.tool_call_id || "",
        output: textOf(m.content as ContentPart | string),
      });
    }
  }
  return input;
}

function formatTools(tools: ToolDefinition[], includeServerSearch: boolean): unknown[] {
  // Server-side web_search replaces the local builtin of the same name:
  // sending both would double-search. The server tool must come first so the
  // model prefers it over remaining function tools.
  const serverTools: unknown[] = includeServerSearch ? [{ type: "web_search" }] : [];
  const functionTools = tools
    .filter((t) => t.name !== SERVER_WEB_SEARCH_TOOL)
    .map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  return [...serverTools, ...functionTools];
}

/** Compact human-readable summary of a completed web_search_call item. */
function summarizeSearchCall(item: any): string {
  const recall = item?.search_recall || {};
  const query = recall?.search_query || item?.query || "";
  const results: Array<{ title?: string; url?: string; text?: string }> =
    recall?.search_results || item?.search_results || [];
  const lines = [`搜索完成${query ? `：${query}` : ""}（${results.length} 条结果）`];
  for (const r of results.slice(0, 3)) {
    const head = [r.title, r.url].filter(Boolean).join(" — ");
    if (head) lines.push(`- ${head}`);
  }
  const firstText = results[0]?.text;
  if (firstText) lines.push(firstText.slice(0, 200));
  return lines.join("\n").slice(0, 1200) || "搜索完成（服务端未返回摘要）";
}

function searchArgsOf(item: any): Record<string, unknown> {
  const query = item?.search_recall?.search_query || item?.query;
  return query ? { query } : {};
}

function isSearchCallItem(item: any): boolean {
  return item?.type === "web_search_call" || item?.type === "web_search";
}

export class DeepSeekResponsesProvider implements ProviderTransport {
  readonly id = "deepseek-responses";
  readonly name = "DeepSeek Responses Transport (server-side web_search)";

  private apiKey: string;
  private baseURL: string;
  private model: string;
  private temperature?: number;
  private customHeaders: Record<string, string>;
  private extraParams: Record<string, unknown>;

  constructor(config: DeepSeekResponsesConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = (config.baseURL || "https://api.deepseek.com").replace(/\/$/, "");
    this.model = config.model || "deepseek-chat";
    this.temperature = config.temperature;
    this.customHeaders = config.customHeaders || {};
    this.extraParams = config.extraParams || {};
  }

  private buildBody(
    messages: Message[],
    tools: ToolDefinition[],
    stream: boolean,
    override?: Partial<ProviderTransportConfig>
  ) {
    const model = override?.model || this.model;
    const body: Record<string, unknown> = {
      model,
      input: formatInput(messages),
      ...this.extraParams,
      ...(override?.extraParams || {}),
    };
    const temperature = override?.temperature ?? this.temperature;
    if (temperature !== undefined) body.temperature = temperature;
    const maxTokens = override?.maxTokens;
    if (maxTokens !== undefined) body.max_output_tokens = maxTokens;
    // 仅 agent 循环调用（有工具定义或服务端工具事件回调）才声明 web_search，
    // 避免视觉协助等纯文本调用触发服务端搜索。
    const includeServerSearch =
      tools.length > 0 || Boolean(override?.onServerToolStart || override?.onServerToolEnd);
    body.tools = formatTools(tools, includeServerSearch);
    // P2-3: Responses API 思考强度控制 — reasoning.effort = none/low/high/max
    // （none 关闭思考；不设字段时由模型/服务端默认策略决定）
    const reasoningEffort = override?.reasoningEffort;
    if (reasoningEffort) {
      body.reasoning = { effort: reasoningEffort };
    }
    if (stream) body.stream = true;
    return body;
  }

  private buildHeaders(override?: Partial<ProviderTransportConfig>): Record<string, string> {
    const customHeaders = { ...this.customHeaders, ...(override?.customHeaders || {}) };
    const apiKey = override?.apiKey || this.apiKey;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...customHeaders,
    };
  }

  private endpoint(baseURL?: string): string {
    const base = (baseURL || this.baseURL).replace(/\/$/, "");
    // DeepSeek documents base_url as https://api.deepseek.com with /responses
    // (no /v1); tolerate OpenAI-style /v1 bases too.
    return `${base.replace(/\/v1$/, "")}/responses`;
  }

  /** Fire start/end observability events for a server-executed tool item. */
  private emitServerTool(
    item: any,
    startTime: number,
    override?: Partial<ProviderTransportConfig>
  ): void {
    const toolCallId = item?.call_id || item?.id || "";
    const args = searchArgsOf(item);
    if (!override) return;
    override.onServerToolStart?.(SERVER_WEB_SEARCH_TOOL, args, toolCallId);
    override.onServerToolEnd?.(
      SERVER_WEB_SEARCH_TOOL,
      summarizeSearchCall(item),
      Date.now() - startTime,
      true,
      toolCallId
    );
  }

  async chat(
    messages: Message[],
    tools: ToolDefinition[] = [],
    overrideConfig?: Partial<ProviderTransportConfig>
  ): Promise<LLMResponse> {
    const body = this.buildBody(messages, tools, false, overrideConfig);
    const res = await fetch(this.endpoint(overrideConfig?.baseURL), {
      method: "POST",
      headers: this.buildHeaders(overrideConfig),
      body: JSON.stringify(body),
      signal: overrideConfig?.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DeepSeek Responses API Error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as any;
    const output: any[] = data.output || [];
    let content = "";
    let reasoning = "";
    const toolCalls: ToolCall[] = [];

    for (const item of output) {
      if (item.type === "reasoning") {
        const summary = item.summary?.map((s: any) => s.text).join("\n\n") || "";
        const bodyText = item.content?.map((c: any) => c.text).join("\n\n") || "";
        reasoning += (reasoning ? "\n\n" : "") + (summary || bodyText);
      } else if (isSearchCallItem(item)) {
        this.emitServerTool(item, Date.now(), overrideConfig);
      } else if (item.type === "message") {
        content += (item.content || [])
          .map((c: any) => (c.type === "output_text" ? c.text : (c.refusal ?? "")))
          .join("");
      } else if (item.type === "function_call") {
        toolCalls.push({
          id: item.call_id || item.id || "",
          name: item.name || "",
          arguments: safeParseToolArgs(item.arguments),
        });
      }
    }

    const usage = data.usage ? normalizeUsage(data.usage) : undefined;
    const usageWithCost =
      usage && data.usage
        ? { ...usage, costUsd: calculateCostUSD(usage, String(body.model)) }
        : undefined;

    if (toolCalls.length > 0) {
      return {
        content: content || null,
        reasoning_content: reasoning || null,
        usage: usageWithCost,
        tool_calls: toolCalls,
      };
    }
    return {
      content: content || "",
      reasoning_content: reasoning || null,
      usage: usageWithCost,
    };
  }

  async chatStream(
    messages: Message[],
    tools: ToolDefinition[] = [],
    overrideConfigOrOnChunk?: Partial<ProviderTransportConfig> | ((chunk: string) => void),
    onChunkOrConfig?: ((chunk: string) => void) | Partial<ProviderTransportConfig>
  ): Promise<LLMResponse> {
    let overrideConfig: Partial<ProviderTransportConfig> | undefined;
    let onChunk: ((chunk: string) => void) | undefined;

    if (typeof overrideConfigOrOnChunk === "function") {
      onChunk = overrideConfigOrOnChunk;
      if (onChunkOrConfig && typeof onChunkOrConfig === "object") {
        overrideConfig = onChunkOrConfig as Partial<ProviderTransportConfig>;
      }
    } else {
      overrideConfig = overrideConfigOrOnChunk;
      if (typeof onChunkOrConfig === "function") onChunk = onChunkOrConfig;
    }

    const body = this.buildBody(messages, tools, true, overrideConfig);
    const res = await fetch(this.endpoint(overrideConfig?.baseURL), {
      method: "POST",
      headers: this.buildHeaders(overrideConfig),
      body: JSON.stringify(body),
      signal: overrideConfig?.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DeepSeek Responses API Error ${res.status}: ${errText}`);
    }

    if (!res.body) {
      return this.chat(messages, tools, overrideConfig);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let accumulatedContent = "";
    let accumulatedReasoning = "";
    let rawUsage: Record<string, unknown> | undefined;
    const toolCallsMap: Record<number, { id: string; name: string; argumentsStr: string }> = {};
    const serverToolStart: Record<string, number> = {};

    const finalizeServerTool = (item: any) => {
      if (!isSearchCallItem(item)) return;
      const toolCallId = item?.call_id || item?.id || "";
      const startTime = serverToolStart[toolCallId] || Date.now();
      delete serverToolStart[toolCallId];
      overrideConfig?.onServerToolStart?.(SERVER_WEB_SEARCH_TOOL, searchArgsOf(item), toolCallId);
      overrideConfig?.onServerToolEnd?.(
        SERVER_WEB_SEARCH_TOOL,
        summarizeSearchCall(item),
        Date.now() - startTime,
        true,
        toolCallId
      );
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const payload = trimmed.substring(6);
        if (payload === "[DONE]") continue;

        let event: any;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        switch (event.type) {
          case "response.output_item.added": {
            const item = event.item;
            if (!item) break;
            if (isSearchCallItem(item)) {
              const toolCallId = item?.call_id || item?.id || "";
              serverToolStart[toolCallId] = Date.now();
              overrideConfig?.onServerToolStart?.(SERVER_WEB_SEARCH_TOOL, {}, toolCallId);
            } else if (item.type === "function_call") {
              toolCallsMap[event.output_index ?? 0] = {
                id: item.call_id || item.id || "",
                name: item.name || "",
                argumentsStr: typeof item.arguments === "string" ? item.arguments : "",
              };
            }
            break;
          }
          case "response.output_item.done": {
            const item = event.item;
            if (!item) break;
            if (isSearchCallItem(item)) {
              finalizeServerTool(item);
            } else if (item.type === "function_call") {
              toolCallsMap[event.output_index ?? 0] = {
                id: item.call_id || toolCallsMap[event.output_index ?? 0]?.id || item.id || "",
                name: item.name || "",
                argumentsStr:
                  typeof item.arguments === "string"
                    ? item.arguments
                    : toolCallsMap[event.output_index ?? 0]?.argumentsStr || "",
              };
            } else if (item.type === "message") {
              const text = (item.content || [])
                .map((c: any) => (c.type === "output_text" ? c.text : (c.refusal ?? "")))
                .join("");
              if (text) accumulatedContent = text;
            }
            break;
          }
          case "response.output_text.delta": {
            if (event.delta) {
              accumulatedContent += event.delta;
              onChunk?.(event.delta);
            }
            break;
          }
          case "response.reasoning_text.delta":
          case "response.reasoning_summary_text.delta": {
            if (event.delta) accumulatedReasoning += event.delta;
            break;
          }
          case "response.function_call_arguments.delta": {
            const index = event.output_index ?? 0;
            const current = toolCallsMap[index] || { id: "", name: "", argumentsStr: "" };
            current.argumentsStr += event.delta || "";
            toolCallsMap[index] = current;
            break;
          }
          case "response.completed":
          case "response.incomplete": {
            if (event.response?.usage) rawUsage = event.response.usage;
            break;
          }
          case "response.failed": {
            const error = event.response?.error;
            throw new Error(
              error
                ? `${error.code || "unknown"}: ${error.message || "no message"}`
                : "DeepSeek Responses stream failed"
            );
          }
          case "error": {
            throw new Error(`DeepSeek Responses error: ${event.message || "unknown"}`);
          }
          default:
            break;
        }
      }
    }

    // Safety net: flush any server tool that completed without an output_item.done
    // (start was already fired at output_item.added).
    for (const [toolCallId, startTime] of Object.entries(serverToolStart)) {
      overrideConfig?.onServerToolEnd?.(
        SERVER_WEB_SEARCH_TOOL,
        "搜索完成",
        Date.now() - startTime,
        true,
        toolCallId
      );
      delete serverToolStart[toolCallId];
    }

    const toolCalls: ToolCall[] = Object.values(toolCallsMap)
      .filter((tc) => tc.name)
      .map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: safeParseToolArgs(tc.argumentsStr),
      }));
    const usage = rawUsage ? normalizeUsage(rawUsage) : undefined;
    const usageWithCost = usage
      ? { ...usage, costUsd: calculateCostUSD(usage, String(body.model)) }
      : undefined;

    if (toolCalls.length > 0) {
      return {
        content: accumulatedContent || null,
        reasoning_content: accumulatedReasoning || null,
        usage: usageWithCost,
        tool_calls: toolCalls,
      };
    }
    return {
      content: accumulatedContent || "",
      reasoning_content: accumulatedReasoning || null,
      usage: usageWithCost,
    };
  }
}
