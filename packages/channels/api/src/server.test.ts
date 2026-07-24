// packages/channels/api/src/server.test.ts
import { createAppContext } from "@hachimi/core";
import { describe, expect, it } from "vitest";
import { createHachimiApiServer } from "./server.js";

describe("Hachimi Daemon API Server & C5 Auth", () => {
  it("GET /health returns server health status without auth", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const response = await server.fastify.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.authRequired).toBe(false);

    await server.close();
  });

  it("POST /api/chat runs agent round and returns response", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const response = await server.fastify.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        prompt: "Hello API Server",
        provider: "mock",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.sessionId).toBeDefined();
    expect(typeof body.content).toBe("string");

    await server.close();
  });

  it("C5 Auth: rejects request with 401 when token is missing or invalid", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({
      appContext,
      secretKey: "super-secret-key",
    });

    // 1. 无 Token 访问 ➔ 401
    const unauthRes = await server.fastify.inject({
      method: "POST",
      url: "/api/chat",
      payload: { prompt: "test" },
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. 错误 Token 访问 ➔ 401
    const wrongTokenRes = await server.fastify.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: "Bearer wrong-key" },
      payload: { prompt: "test" },
    });
    expect(wrongTokenRes.statusCode).toBe(401);

    // 3. 正确 Token 访问 ➔ 200 OK
    const validRes = await server.fastify.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: "Bearer super-secret-key" },
      payload: { prompt: "hello", provider: "mock" },
    });
    expect(validRes.statusCode).toBe(200);
    const body = JSON.parse(validRes.body);
    expect(body.success).toBe(true);

    await server.close();
  });
});
