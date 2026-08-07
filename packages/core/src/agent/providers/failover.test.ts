import { describe, expect, it, vi } from "vitest";
import type { LLMProvider, Message } from "../../types/index.js";
import { FailoverLLMProvider, isRetryableError, withExponentialBackoff } from "./failover.js";

describe("FailoverLLMProvider & Retry Suite", () => {
  it("correctly identifies retryable HTTP and network errors", () => {
    expect(isRetryableError(new Error("LLM API Error 429: Rate limit exceeded"))).toBe(true);
    expect(isRetryableError(new Error("LLM API Error 503: Service Unavailable"))).toBe(true);
    expect(isRetryableError(new Error("fetch failed: ECONNRESET"))).toBe(true);

    expect(isRetryableError(new Error("LLM API Error 401: Invalid API key"))).toBe(false);
    expect(isRetryableError(new Error("Execution aborted by user"))).toBe(false);
  });

  it("retries primary provider with exponential backoff on retryable error", async () => {
    let attempts = 0;
    const mockPrimaryFn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("LLM API Error 429: Rate limited");
      }
      return { content: "Success after retries" };
    };

    const res = await withExponentialBackoff(mockPrimaryFn, {
      maxRetries: 3,
      initialDelayMs: 10,
      backoffFactor: 2,
    });

    expect(res.content).toBe("Success after retries");
    expect(attempts).toBe(3);
  });

  it("switches to fallback provider when primary exceeds retries", async () => {
    const mockPrimary: LLMProvider = {
      chat: async () => {
        throw new Error("LLM API Error 503: Service Unavailable");
      },
    };

    const mockFallback: LLMProvider = {
      chat: async () => {
        return { content: "Response from fallback provider" };
      },
    };

    const failover = new FailoverLLMProvider({
      primary: mockPrimary,
      fallback: mockFallback,
      maxRetries: 1,
      initialDelayMs: 10,
    });

    const messages: Message[] = [{ id: "m1", role: "user", content: "Hi", timestamp: Date.now() }];
    const res = await failover.chat(messages);

    expect(res.content).toBe("Response from fallback provider");
  });
});
