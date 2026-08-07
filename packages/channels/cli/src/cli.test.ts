// packages/channels/cli/src/cli.test.ts
import { describe, expect, it } from "vitest";
import { runCliChannel } from "./index.js";

describe("CliChannel Single-turn Execution", () => {
  it("runs single-turn prompt and returns structured CliRunResult", async () => {
    const result = await runCliChannel({
      prompt: "Hello Mock Agent",
      outputFormat: "json",
      provider: "mock",
    });

    expect(result.success).toBe(true);
    expect(result.sessionId).toBeDefined();
    expect(typeof result.content).toBe("string");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("supports text streaming callback in runCliChannel", async () => {
    const chunks: string[] = [];
    const result = await runCliChannel({
      prompt: "Test streaming",
      outputFormat: "text",
      provider: "mock",
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(result.success).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });
});
