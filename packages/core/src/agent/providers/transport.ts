import type { ProviderTransport, ProviderTransportConfig } from "../../types/index.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { AnthropicProviderTransport } from "./anthropic.js";

/** 支持的 Provider 传输层标识 (规范标识：anthropic, openai, deepseek, qwen, moonshot, ollama) */
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
    let normType = type.toLowerCase().trim();

    // 别名规范化收敛：claude 为 anthropic 传输层的兼容别名
    if (normType === "claude") {
      normType = "anthropic";
    }

    switch (normType) {
      case "anthropic":
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
