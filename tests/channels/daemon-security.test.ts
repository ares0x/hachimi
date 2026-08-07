// tests/channels/daemon-security.test.ts
import { describe, expect, it } from "vitest";
import { createHachimiApiServer } from "../../packages/channels/api/src/server.js";
import { createHarnessRuntime } from "../../packages/core/src/index.js";

describe("Daemon Server API E2E Security & Approval Policy Test", () => {
  it("rejects unconfirmed dangerous tool execution through POST /api/chat HTTP request", async () => {
    const runtime = createHarnessRuntime({
      providerOverride: "mock",
      channelPolicy: "allow-safe",
    });

    runtime.tools.register({
      name: "danger_delete_db",
      description: "删除主数据库的高危工具",
      permission: "dangerous",
      parameters: { type: "object", properties: {} },
      execute: async () => "数据库已删除",
    });

    const apiServer = createHachimiApiServer({ runtime });

    const response = await apiServer.fastify.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        prompt: "请调用工具 danger_delete_db",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);

    expect(body.success).toBe(true);
    expect(body.content).toMatch(/\[(用户拦截|User Rejected)\]/);
    expect(body.content).not.toContain("数据库已删除");

    await apiServer.close();
  });
});
