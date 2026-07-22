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
}
