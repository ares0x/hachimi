import { log } from "@hachimi/shared";
import type {
  LLMProvider,
  LLMResponse,
  Message,
  ProviderTransportConfig,
  ToolDefinition,
} from "../../types/index.js";

export interface FailoverProviderOptions {
  primary: LLMProvider;
  fallback?: LLMProvider;
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
}

export function isRetryableError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as Error).message || err);

  // Do NOT retry on explicit user cancellation
  if (msg.includes("abort") || msg.includes("cancelled")) return false;
  // Do NOT retry on auth / configuration errors
  if (msg.includes("401") || msg.includes("403") || msg.includes("API key")) return false;

  // Retry on rate limit (429), server errors (500, 502, 503, 504), network glitches
  return (
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("overloaded")
  );
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    backoffFactor?: number;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const backoffFactor = options.backoffFactor ?? 2;

  let delay = initialDelayMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw new Error("Execution aborted by user");
    }

    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      if (attempt >= maxRetries || !isRetryableError(err) || options.signal?.aborted) {
        throw err;
      }

      log(
        "warn",
        `[LLM Retry] Attempt ${attempt + 1}/${maxRetries} failed: ${(err as Error).message}. Retrying in ${delay}ms...`
      );

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        if (options.signal) {
          options.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("Execution aborted by user"));
            },
            { once: true }
          );
        }
      });

      delay *= backoffFactor;
    }
  }

  throw lastError;
}

export class FailoverLLMProvider implements LLMProvider {
  private primary: LLMProvider;
  private fallback?: LLMProvider;
  private maxRetries: number;

  constructor(options: FailoverProviderOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async chat(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: Partial<ProviderTransportConfig>
  ): Promise<LLMResponse> {
    try {
      return await withExponentialBackoff(() => this.primary.chat(messages, tools, options), {
        maxRetries: this.maxRetries,
        signal: options?.signal,
      });
    } catch (primaryErr) {
      if (this.fallback && isRetryableError(primaryErr)) {
        log(
          "warn",
          `[LLM Failover] Primary provider failed after retries: ${(primaryErr as Error).message}. Switching to fallback provider...`
        );
        return await withExponentialBackoff(() => this.fallback!.chat(messages, tools, options), {
          maxRetries: 2,
          signal: options?.signal,
        });
      }
      throw primaryErr;
    }
  }

  async chatStream(
    messages: Message[],
    tools?: ToolDefinition[],
    onChunk?: (chunk: string) => void,
    options?: Partial<ProviderTransportConfig>
  ): Promise<LLMResponse> {
    const streamFn = this.primary.chatStream
      ? (p: LLMProvider) => p.chatStream!(messages, tools, onChunk, options)
      : (p: LLMProvider) => p.chat(messages, tools, options);

    try {
      return await withExponentialBackoff(() => streamFn(this.primary), {
        maxRetries: this.maxRetries,
        signal: options?.signal,
      });
    } catch (primaryErr) {
      if (this.fallback && isRetryableError(primaryErr)) {
        log(
          "warn",
          `[LLM Failover] Primary provider stream failed: ${(primaryErr as Error).message}. Switching to fallback provider...`
        );
        const fallbackFn = this.fallback.chatStream
          ? (p: LLMProvider) => p.chatStream!(messages, tools, onChunk, options)
          : (p: LLMProvider) => p.chat(messages, tools, options);

        return await withExponentialBackoff(() => fallbackFn(this.fallback!), {
          maxRetries: 2,
          signal: options?.signal,
        });
      }
      throw primaryErr;
    }
  }
}
