// tests/smoke/smoke.test.ts
import { createHachimiApiServer } from "@hachimi/channel-api";
import { runCliChannel } from "@hachimi/channel-cli";
import { createHarnessRuntime } from "@hachimi/core";
import { describe, expect, it } from "vitest";

describe("Phase H1.4 Production Readiness Smoke Test Suite", () => {
  it("Smoke 1: TUI & Core offline initialization works without API keys", () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const status = runtime.getStatus();

    expect(status.title).toBeDefined();
    expect(status.llm.provider).toBe("mock");
    expect(status.memory.totalCount).toBeGreaterThanOrEqual(0);
  });

  it("Smoke 2: CLI single-turn execution works in mock mode", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const result = await runCliChannel({
      prompt: "烟雾测试 Prompt",
      provider: "mock",
      runtime,
    });

    expect(result.success).toBe(true);
    expect(result.sessionId).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("Smoke 3: Daemon Server /health responds with 200 OK and x-request-id header", async () => {
    const runtime = createHarnessRuntime({ providerOverride: "mock" });
    const apiServer = createHachimiApiServer({ runtime });

    const response = await apiServer.fastify.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(response.headers["x-request-id"]).toBeDefined();
  });
});
