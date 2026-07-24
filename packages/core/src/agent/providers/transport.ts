import type { ProviderTransport, ProviderTransportConfig } from "../../types/index.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { AnthropicProviderTransport } from "./anthropic.js";

export type ProviderType =
  | "openai-compatible"
  | "openai"
  | "deepseek"
  | "moonshot"
  | "qwen"
  | "anthropic"
  | "claude"
  | "ollama";

export class ProviderRegistry {
  private static transports = new Map<string, ProviderTransport>();

  static register(transport: ProviderTransport) {
    this.transports.set(transport.id, transport);
  }

  static get(id: string): ProviderTransport | undefined {
    return this.transports.get(id);
  }

  static create(type: ProviderType | string, config: ProviderTransportConfig): ProviderTransport {
    const normType = type.toLowerCase().trim();

    switch (normType) {
      case "anthropic":
      case "claude":
        return new AnthropicProviderTransport(config);

      case "openai":
      case "openai-compatible":
      case "deepseek":
      case "moonshot":
      case "qwen":
      case "ollama":
      default:
        return new OpenAICompatibleProvider(config);
    }
  }
}
