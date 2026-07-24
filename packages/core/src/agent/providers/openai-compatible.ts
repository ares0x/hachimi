import type { Message, ToolDefinition, LLMResponse, LLMProvider } from "../../types/index.js";

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
}

export class OpenAICompatibleProvider implements LLMProvider {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private temperature: number;

  constructor(config: OpenAICompatibleConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = (config.baseURL || "https://api.openai.com/v1").replace(/\/$/, "");
    this.model = config.model || "gpt-4o-mini";
    this.temperature = config.temperature ?? 0.7;
  }

  async chat(messages: Message[], tools: ToolDefinition[] = []): Promise<LLMResponse> {
    const body: any = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role === "tool" ? "tool" : m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
      temperature: this.temperature,
    };

    // 如果有工具，转为 OpenAI tools 格式
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

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM API Error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;

    if (!choice) {
      throw new Error("Invalid response from LLM API");
    }

    // 处理工具调用
    if (choice.tool_calls && choice.tool_calls.length > 0) {
      return {
        content: choice.content || null,
        tool_calls: choice.tool_calls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || "{}"),
        })),
      };
    }

    return {
      content: choice.content || "",
    };
  }

  async chatStream(
    messages: Message[],
    tools: ToolDefinition[] = [],
    onChunk?: (chunk: string) => void
  ): Promise<LLMResponse> {
    const body: any = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role === "tool" ? "tool" : m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
      temperature: this.temperature,
      stream: true,
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

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM API Error ${res.status}: ${errText}`);
    }

    if (!res.body) {
      return this.chat(messages, tools);
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
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed === "data: [DONE]") continue;

        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.substring(6));
            const delta = data.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              accumulatedContent += delta.content;
              if (onChunk) {
                onChunk(delta.content);
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
                  if (tc.function?.arguments) toolCallsMap[index].argumentsStr += tc.function.arguments;
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
