// packages/channels/api/src/server.test.ts

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CredentialStore } from "@hachimi/config";
import { createAppContext, createHarnessRuntime, SkillPackageLoader } from "@hachimi/core";
import { afterAll, describe, expect, it, vi } from "vitest";
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
  }, 30_000);

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

  it("POST /api/session/model dynamically updates model and connection", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const response = await server.fastify.inject({
      method: "POST",
      url: "/api/session/model",
      payload: {
        connectionId: "mock",
        modelId: "mock-model-v2",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.activeConnectionId).toBe("mock");

    await server.close();
  });

  it("POST /api/llm/connections/:id/test runs 15s health check", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const response = await server.fastify.inject({
      method: "POST",
      url: "/api/llm/connections/mock/test",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);

    await server.close();
  });

  it("GET /api/skills/proposals lists proposals", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const response = await server.fastify.inject({
      method: "GET",
      url: "/api/skills/proposals",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.proposals)).toBe(true);

    await server.close();
  });
});

describe("L1 Desktop API routes (tasks / usage / search / grants)", () => {
  it("GET /api/tasks lists background tasks and kill works", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    // 使用 server 实际持有的 context（singleton 可能不同于传入的 appContext）
    const task = server.appContext.backgroundTasks.startCommand("sleep 0.2 && echo done", {
      label: "l1-test",
    });
    const listRes = await server.fastify.inject({ method: "GET", url: "/api/tasks" });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.tasks.some((t: any) => t.taskId === task.taskId)).toBe(true);

    const killRes = await server.fastify.inject({
      method: "POST",
      url: `/api/tasks/${task.taskId}/kill`,
    });
    expect(killRes.statusCode).toBe(200);
    expect(JSON.parse(killRes.body).success).toBe(true);

    const missing = await server.fastify.inject({
      method: "POST",
      url: "/api/tasks/task_missing/kill",
    });
    expect(missing.statusCode).toBe(404);

    await server.close();
  }, 30_000);

  it("GET /api/usage returns an aggregate summary after a run", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    await server.fastify.inject({
      method: "POST",
      url: "/api/chat",
      payload: { prompt: "L1 usage probe 用量探针", provider: "mock" },
    });

    const res = await server.fastify.inject({ method: "GET", url: "/api/usage?days=7" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.runs).toBeGreaterThanOrEqual(1);
    expect(typeof body.costUsd).toBe("number");
    expect(Array.isArray(body.bySession)).toBe(true);

    await server.close();
  }, 30_000);

  it("GET /api/search finds message content and work titles", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const token = `searchtoken_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await server.fastify.inject({
      method: "POST",
      url: "/api/chat",
      payload: { prompt: `请记住 ${token} 这个专有名词`, provider: "mock" },
    });

    const res = await server.fastify.inject({
      method: "GET",
      url: `/api/search?q=${encodeURIComponent(token)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.some((r: any) => r.type === "message" && r.content.includes(token))).toBe(
      true
    );

    // empty query returns no results
    const empty = await server.fastify.inject({ method: "GET", url: "/api/search?q=" });
    expect(JSON.parse(empty.body).results).toEqual([]);

    await server.close();
  }, 30_000);

  it("GET /api/grants lists remembered grants (empty by default)", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const res = await server.fastify.inject({ method: "GET", url: "/api/grants" });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body).grants)).toBe(true);

    await server.close();
  });

  it("GET /api/approvals lists pending approvals while one is waiting", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    // 触发一个需要审批的工具调用（mock provider 会用 write_file / run_command 等）
    const chatPromise = server.fastify.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        prompt: "调用工具 run_command",
        provider: "mock",
        stream: true,
      },
    });

    // 轮询等待 pending approval 出现（mock 流式回合可能在几百 ms 内触发审批）
    let approvals: any[] = [];
    for (let i = 0; i < 50; i++) {
      const res = await server.fastify.inject({ method: "GET", url: "/api/approvals" });
      approvals = JSON.parse(res.body).approvals || [];
      if (approvals.length > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(approvals.length).toBeGreaterThan(0);
    const first = approvals[0];
    expect(first.approvalId).toBeTruthy();
    expect(typeof first.toolName).toBe("string");
    expect(typeof first.requestedAt).toBe("number");

    // 审批决议后队列应清空
    const decide = await server.fastify.inject({
      method: "POST",
      url: "/api/tools/approve",
      payload: { approvalId: first.approvalId, decision: "deny" },
    });
    expect(decide.statusCode).toBe(200);
    const after = await server.fastify.inject({ method: "GET", url: "/api/approvals" });
    expect(
      JSON.parse(after.body).approvals.some((a: any) => a.approvalId === first.approvalId)
    ).toBe(false);

    await chatPromise;
    await server.close();
  }, 30_000);

  it("POST /api/llm/active switches the active connection and persists the model", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-l1-"));
    const configPath = join(dir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        llm: {
          activeConnectionId: "mock",
          connections: {
            mock: {
              id: "mock",
              name: "Mock LLM",
              providerType: "mock",
              enabled: false,
              apiKey: "",
              defaultModelId: "mock-model",
              models: ["mock-model"],
              enabledModels: ["mock-model"],
            },
            deepseek: {
              id: "deepseek",
              name: "DeepSeek Official",
              providerType: "deepseek",
              enabled: true,
              apiKey: "",
              defaultModelId: "deepseek-v4-flash",
              models: ["deepseek-v4-flash", "deepseek-v4-pro"],
              enabledModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
            },
          },
        },
      }),
      "utf-8"
    );

    const runtime = createHarnessRuntime({ configPath, providerOverride: "mock" });
    const server = createHachimiApiServer({ runtime });

    // 1. 切换连接 + 模型
    const res = await server.fastify.inject({
      method: "POST",
      url: "/api/llm/active",
      payload: { providerId: "deepseek", model: "deepseek-v4-flash" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).activeConnectionId).toBe("deepseek");

    const cfgRes = await server.fastify.inject({ method: "GET", url: "/api/config" });
    const cfg = JSON.parse(cfgRes.body);
    expect(cfg.activeConnectionId).toBe("deepseek");
    expect(cfg.connections.find((c: any) => c.id === "deepseek").model).toBe("deepseek-v4-flash");

    // 2. 未知连接 → 400
    const unknown = await server.fastify.inject({
      method: "POST",
      url: "/api/llm/active",
      payload: { providerId: "nope", model: "x" },
    });
    expect(unknown.statusCode).toBe(400);

    // 3. 仅传 model：沿用当前激活连接（deepseek）
    const modelOnly = await server.fastify.inject({
      method: "POST",
      url: "/api/llm/active",
      payload: { model: "deepseek-v4-pro" },
    });
    expect(modelOnly.statusCode).toBe(200);
    expect(JSON.parse(modelOnly.body).activeConnectionId).toBe("deepseek");

    // 4. 当前激活是 mock 时仅传 model → 400（避免误以为切换到真实模型）
    const mockCfg = mkdtempSync(join(tmpdir(), "hachimi-l1-"));
    const mockConfigPath = join(mockCfg, "config.json");
    writeFileSync(mockConfigPath, JSON.stringify({ llm: { activeConnectionId: "mock" } }), "utf-8");
    const mockRuntime = createHarnessRuntime({
      configPath: mockConfigPath,
      providerOverride: "mock",
    });
    const mockServer = createHachimiApiServer({ runtime: mockRuntime });
    const rejected = await mockServer.fastify.inject({
      method: "POST",
      url: "/api/llm/active",
      payload: { model: "deepseek-v4-flash" },
    });
    expect(rejected.statusCode).toBe(400);
    await mockServer.close();

    await server.close();
  }, 30_000);
});

describe("Vision companion API (model eyes)", () => {
  it("PATCH /api/config persists llm.vision config", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const response = await server.fastify.inject({
      method: "PATCH",
      url: "/api/config",
      payload: {
        vision: { enabled: true, connectionId: "openai", modelId: "gpt-4o" },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.vision).toMatchObject({
      enabled: true,
      connectionId: "openai",
      modelId: "gpt-4o",
    });

    await server.close();
  });

  it("GET /api/llm/connections returns vision config and visionModels", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const response = await server.fastify.inject({
      method: "GET",
      url: "/api/llm/connections",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("vision");
    expect(Array.isArray(body.connections)).toBe(true);
    const openai = body.connections.find((c: any) => c.id === "openai");
    if (openai) {
      expect(openai.visionModels).toContain("gpt-4o");
    }

    await server.close();
  });

  it("POST /api/llm/vision/test returns 400 when no vision-capable connection exists", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    // Strip vision-capable connections from the runtime config so auto-detect fails.
    const cfg = appContext.getConfig();
    if (cfg.llm.connections) {
      for (const [id, conn] of Object.entries(cfg.llm.connections)) {
        if (id !== "mock") delete cfg.llm.connections[id];
      }
    }

    const response = await server.fastify.inject({
      method: "POST",
      url: "/api/llm/vision/test",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);

    await server.close();
  });
});

describe("API key management & connection testing UX", () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  /** Isolated server: temp config + temp credential store, never touches ~/.hachimi */
  function makeIsolatedServer() {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-keys-"));
    tempDirs.push(dir);
    const configPath = join(dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ llm: { activeConnectionId: "mock" } }), "utf-8");
    const appContext = createAppContext({ configPath, providerOverride: "mock" });
    const server = createHachimiApiServer({
      appContext,
      configPath,
      credentialStore: new CredentialStore(join(dir, "credentials.json")),
    });
    return { server, configPath };
  }

  it("POST /api/llm/connections stores an API key into the credential store", async () => {
    const { server, configPath } = makeIsolatedServer();

    const createRes = await server.fastify.inject({
      method: "POST",
      url: "/api/llm/connections",
      payload: {
        id: "test-provider",
        name: "Test Provider",
        providerType: "deepseek",
        apiKey: "sk-test-secret",
      },
    });
    expect(createRes.statusCode).toBe(200);
    expect(JSON.parse(createRes.body).success).toBe(true);

    const listRes = await server.fastify.inject({
      method: "GET",
      url: "/api/llm/connections",
    });
    const body = JSON.parse(listRes.body);
    const conn = body.connections.find((c: any) => c.id === "test-provider");
    expect(conn).toBeDefined();
    expect(conn.hasKey).toBe(true);
    // Connection persisted to the injected config path (not ~/.hachimi)
    const saved = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(saved.llm.connections["test-provider"]).toBeDefined();
    // Key never leaks into the API response
    expect(conn.apiKeyPreview).not.toContain("sk-test-secret");
    expect(JSON.stringify(body)).not.toContain("sk-test-secret");

    await server.close();
  });

  it("POST /api/llm/connections persists serverWebSearch and GET exposes it", async () => {
    const { server, configPath } = makeIsolatedServer();

    const updateRes = await server.fastify.inject({
      method: "POST",
      url: "/api/llm/connections",
      payload: { id: "deepseek", serverWebSearch: true },
    });
    expect(updateRes.statusCode).toBe(200);

    const listRes = await server.fastify.inject({
      method: "GET",
      url: "/api/llm/connections",
    });
    const body = JSON.parse(listRes.body);
    const conn = body.connections.find((c: any) => c.id === "deepseek");
    expect(conn?.serverWebSearch).toBe(true);

    const saved = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(saved.llm.connections["deepseek"].serverWebSearch).toBe(true);

    await server.close();
  });

  it("connection test returns 400 with a clear message when no key is configured", async () => {
    const { server } = makeIsolatedServer();

    // deepseek exists in the default catalog but has no key in the isolated credential store
    const response = await server.fastify.inject({
      method: "POST",
      url: "/api/llm/connections/deepseek/test",
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain("API key");

    await server.close();
  });

  it("GET /api/llm/connections exposes activeConnectionId for the active badge", async () => {
    const { server } = makeIsolatedServer();

    const response = await server.fastify.inject({
      method: "GET",
      url: "/api/llm/connections",
    });
    const body = JSON.parse(response.body);
    expect(body.activeConnectionId).toBe("mock");

    await server.close();
  });

  it("GET /api/llm/connections exposes the provider catalog for the settings list", async () => {
    const { server } = makeIsolatedServer();

    const response = await server.fastify.inject({
      method: "GET",
      url: "/api/llm/connections",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.catalog)).toBe(true);
    const deepseek = body.catalog.find((p: any) => p.id === "deepseek");
    expect(deepseek).toBeDefined();
    expect(deepseek.label).toBe("DeepSeek");
    expect(deepseek.requiresKey).toBe(true);
    expect(deepseek.fallbackModels.length).toBeGreaterThan(0);

    await server.close();
  });

  it("POST /api/llm/connections seeds a new connection from the catalog preset", async () => {
    const { server, configPath } = makeIsolatedServer();

    const createRes = await server.fastify.inject({
      method: "POST",
      url: "/api/llm/connections",
      payload: { id: "my-openai", name: "My OpenAI", providerType: "openai" },
    });
    expect(createRes.statusCode).toBe(200);

    const saved = JSON.parse(readFileSync(configPath, "utf-8"));
    const conn = saved.llm.connections["my-openai"];
    expect(conn).toBeDefined();
    expect(conn.baseUrl).toBe("https://api.openai.com/v1");
    expect(conn.models).toContain("gpt-4o");
    expect(conn.defaultModelId).toBe("gpt-4o");

    await server.close();
  });

  it("GET/POST /api/personal-context/soul reads and writes SOUL.md at the configured soulPath", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-soul-"));
    tempDirs.push(dir);
    const configPath = join(dir, "config.json");
    const soulPath = join(dir, "SOUL.md");
    writeFileSync(
      configPath,
      JSON.stringify({
        personalContext: { soulPath },
        llm: { activeConnectionId: "mock" },
      }),
      "utf-8"
    );
    const runtime = createHarnessRuntime({ configPath, providerOverride: "mock" });
    const server = createHachimiApiServer({ runtime, configPath });

    // 1. GET returns empty content when the file does not exist yet
    const emptyRes = await server.fastify.inject({
      method: "GET",
      url: "/api/personal-context/soul",
    });
    expect(emptyRes.statusCode).toBe(200);
    expect(JSON.parse(emptyRes.body).soulPath).toBe(soulPath);
    expect(JSON.parse(emptyRes.body).content).toBe("");

    // 2. POST writes content to the file
    const writeRes = await server.fastify.inject({
      method: "POST",
      url: "/api/personal-context/soul",
      payload: { content: "你是 Hachimi，一个本地优先的 AI 助理。" },
    });
    expect(writeRes.statusCode).toBe(200);
    expect(JSON.parse(writeRes.body).success).toBe(true);
    expect(readFileSync(soulPath, "utf-8")).toBe("你是 Hachimi，一个本地优先的 AI 助理。");

    // 3. GET now returns the persisted content
    const readRes = await server.fastify.inject({
      method: "GET",
      url: "/api/personal-context/soul",
    });
    expect(JSON.parse(readRes.body).content).toBe("你是 Hachimi，一个本地优先的 AI 助理。");

    await server.close();
  });
});

describe("Credential management endpoints", () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  function makeIsolatedServer() {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-cred-api-"));
    tempDirs.push(dir);
    const configPath = join(dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ llm: { activeConnectionId: "mock" } }), "utf-8");
    const appContext = createAppContext({ configPath, providerOverride: "mock" });
    const server = createHachimiApiServer({
      appContext,
      configPath,
      credentialStore: new CredentialStore(join(dir, "credentials.json")),
    });
    return { server };
  }

  it("GET /api/credentials lists masked entries and never leaks values", async () => {
    const { server } = makeIsolatedServer();

    const put = await server.fastify.inject({
      method: "PUT",
      url: "/api/credentials/tavily/api_key",
      payload: { value: "tvly-super-secret-key-123456" },
    });
    expect(put.statusCode).toBe(200);
    expect(JSON.parse(put.body).success).toBe(true);

    const res = await server.fastify.inject({ method: "GET", url: "/api/credentials" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].slug).toBe("tavily");
    expect(body.entries[0].kind).toBe("api_key");
    expect(body.entries[0].hasValue).toBe(true);
    expect(body.entries[0].preview).not.toContain("super-secret");
    expect(res.body).not.toContain("tvly-super-secret");

    await server.close();
  });

  it("PUT /api/credentials rejects unknown kinds and empty values", async () => {
    const { server } = makeIsolatedServer();

    const badKind = await server.fastify.inject({
      method: "PUT",
      url: "/api/credentials/foo/not_a_kind",
      payload: { value: "x" },
    });
    expect(badKind.statusCode).toBe(400);

    const empty = await server.fastify.inject({
      method: "PUT",
      url: "/api/credentials/foo/api_key",
      payload: { value: "   " },
    });
    expect(empty.statusCode).toBe(400);

    await server.close();
  });

  it("DELETE /api/credentials/:slug/:kind removes only that kind", async () => {
    const { server } = makeIsolatedServer();

    await server.fastify.inject({
      method: "PUT",
      url: "/api/credentials/mcp-github/api_key",
      payload: { value: "ghp_1" },
    });
    await server.fastify.inject({
      method: "PUT",
      url: "/api/credentials/mcp-github/env_secret",
      payload: { value: "ghp_2" },
    });

    const del = await server.fastify.inject({
      method: "DELETE",
      url: "/api/credentials/mcp-github/api_key",
    });
    expect(del.statusCode).toBe(200);

    const res = await server.fastify.inject({ method: "GET", url: "/api/credentials" });
    const entries = JSON.parse(res.body).entries as { slug: string; kind: string }[];
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("env_secret");

    await server.close();
  });
});

describe("Skills management endpoints", () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  /** Isolated server with a temp skills root (never touches ~/.hachimi). */
  function makeIsolatedServer() {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-skills-api-"));
    tempDirs.push(dir);
    const skillsRoot = join(dir, "skills");
    mkdirSync(skillsRoot, { recursive: true });
    const configPath = join(dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ llm: { activeConnectionId: "mock" } }), "utf-8");
    const skillLoader = new SkillPackageLoader({
      customDirs: [skillsRoot],
    });
    const appContext = createAppContext({ configPath, providerOverride: "mock", skillLoader });
    const server = createHachimiApiServer({
      appContext,
      configPath,
      credentialStore: new CredentialStore(join(dir, "credentials.json")),
    });
    return { server, skillsRoot };
  }

  it("POST /api/skills creates a user skill and GET lists it with metadata", async () => {
    const { server, skillsRoot } = makeIsolatedServer();

    const createRes = await server.fastify.inject({
      method: "POST",
      url: "/api/skills",
      payload: { name: "daily-report", description: "生成日报", instructions: "汇总今日工作" },
    });
    expect(createRes.statusCode).toBe(200);
    expect(JSON.parse(createRes.body).success).toBe(true);
    expect(existsSync(join(skillsRoot, "daily-report", "SKILL.md"))).toBe(true);

    const listRes = await server.fastify.inject({ method: "GET", url: "/api/skills" });
    const body = JSON.parse(listRes.body);
    const skill = body.skills.find((s: any) => s.name === "daily-report");
    expect(skill).toBeDefined();
    expect(skill.source).toBe("project"); // first custom dir is the write root
    expect(skill.version).toBe("0.0.1");
    expect(skill.content).toContain("汇总今日工作");

    await server.close();
  });

  it("PUT /api/skills/:id updates content and DELETE removes it", async () => {
    const { server, skillsRoot } = makeIsolatedServer();

    await server.fastify.inject({
      method: "POST",
      url: "/api/skills",
      payload: { name: "tidy", description: "v1", instructions: "v1 内容" },
    });

    const updateRes = await server.fastify.inject({
      method: "PUT",
      url: "/api/skills/tidy",
      payload: {
        content: "---\nname: tidy\ndescription: v2\nversion: 0.2.0\n---\n\nv2 内容",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const raw = readFileSync(join(skillsRoot, "tidy", "SKILL.md"), "utf-8");
    expect(raw).toContain("v2 内容");

    const delRes = await server.fastify.inject({ method: "DELETE", url: "/api/skills/tidy" });
    expect(delRes.statusCode).toBe(200);
    expect(existsSync(join(skillsRoot, "tidy"))).toBe(false);

    await server.close();
  });

  it("DELETE rejects built-in skills", async () => {
    const { server } = makeIsolatedServer();
    const delRes = await server.fastify.inject({ method: "DELETE", url: "/api/skills/writing" });
    expect(delRes.statusCode).toBe(400);
    expect(JSON.parse(delRes.body).error).toContain("内置技能");
    await server.close();
  });

  it("POST /api/skills/install installs from a GitHub repo", async () => {
    const { server, skillsRoot } = makeIsolatedServer();

    const fetcher = vi.fn(async (url: string) => {
      if (String(url).includes("/repos/owner/repo") && !String(url).includes("/git/trees/")) {
        return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
      }
      if (String(url).includes("/git/trees/main?recursive=1")) {
        return new Response(
          JSON.stringify({
            tree: [{ path: "skills/awesome-skill/SKILL.md", type: "blob" }],
          }),
          { status: 200 }
        );
      }
      if (
        String(url).includes(
          "raw.githubusercontent.com/owner/repo/main/skills/awesome-skill/SKILL.md"
        )
      ) {
        return new Response(
          "---\nname: awesome-skill\ndescription: 超棒技能\nversion: 1.0.0\n---\n\n技能正文\n",
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);

    try {
      const installRes = await server.fastify.inject({
        method: "POST",
        url: "/api/skills/install",
        payload: { url: "https://github.com/owner/repo" },
      });
      expect(installRes.statusCode).toBe(200);
      const body = JSON.parse(installRes.body);
      expect(body.success).toBe(true);
      expect(body.count).toBe(1);
      expect(existsSync(join(skillsRoot, "awesome-skill", "SKILL.md"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    await server.close();
  });

  it("POST /api/skills/install returns a clear error for invalid URLs", async () => {
    const { server } = makeIsolatedServer();
    const installRes = await server.fastify.inject({
      method: "POST",
      url: "/api/skills/install",
      payload: { url: "https://example.com/nope" },
    });
    expect(installRes.statusCode).toBe(400);
    expect(JSON.parse(installRes.body).error).toContain("无效的 GitHub URL");
    await server.close();
  });
});

describe("Memory, audit & permission-rules APIs", () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  /** Isolated config path so PATCH /api/config never touches ~/.hachimi/config.json */
  function makeServerWithConfigPath() {
    const dir = mkdtempSync(join(tmpdir(), "hachimi-cfg-api-"));
    tempDirs.push(dir);
    const configPath = join(dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ llm: { activeConnectionId: "mock" } }), "utf-8");
    const appContext = createAppContext({ configPath, providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext, configPath });
    return { server, configPath };
  }

  it("memory CRUD: add / layer list / delete", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });
    const content = `测试记忆 ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;

    const addRes = await server.fastify.inject({
      method: "POST",
      url: "/api/memory",
      payload: { content, layer: "long_term", importance: 0.8 },
    });
    expect(addRes.statusCode).toBe(200);
    const entry = JSON.parse(addRes.body).entry;
    expect(entry.id).toBeDefined();
    expect(entry.layer).toBe("long_term");

    const listRes = await server.fastify.inject({
      method: "GET",
      url: "/api/memory?layer=long_term",
    });
    const listBody = JSON.parse(listRes.body);
    expect(listBody.memories.some((m: any) => m.id === entry.id)).toBe(true);
    expect(typeof listBody.layers.long_term).toBe("number");

    const delRes = await server.fastify.inject({
      method: "DELETE",
      url: `/api/memory/${entry.id}`,
    });
    expect(delRes.statusCode).toBe(200);

    const afterRes = await server.fastify.inject({
      method: "GET",
      url: "/api/memory?layer=long_term",
    });
    expect(JSON.parse(afterRes.body).memories.some((m: any) => m.id === entry.id)).toBe(false);

    await server.close();
  });

  it("POST /api/memory rejects empty content", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const res = await server.fastify.inject({
      method: "POST",
      url: "/api/memory",
      payload: { content: "   " },
    });
    expect(res.statusCode).toBe(400);

    await server.close();
  });

  it("POST /api/memory/clear wipes a single layer", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });
    const content = `待清空 ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;

    await server.fastify.inject({
      method: "POST",
      url: "/api/memory",
      payload: { content, layer: "working" },
    });
    const clearRes = await server.fastify.inject({
      method: "POST",
      url: "/api/memory/clear",
      payload: { layer: "working" },
    });
    expect(clearRes.statusCode).toBe(200);

    const listRes = await server.fastify.inject({
      method: "GET",
      url: "/api/memory?layer=working",
    });
    const listBody = JSON.parse(listRes.body);
    expect(listBody.memories.some((m: any) => m.content === content)).toBe(false);

    const badRes = await server.fastify.inject({
      method: "POST",
      url: "/api/memory/clear",
      payload: { layer: "not_a_layer" },
    });
    expect(badRes.statusCode).toBe(400);

    await server.close();
  });

  it("GET /api/audit lists approval events with workId filter", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const work = server.runtime.works.create({ intent: "审计测试", uiKind: "conversation" });
    const sessionId = work.sessionIds[0] || work.id;
    await server.runtime.events.append({
      id: `evt_audit_${Date.now()}`,
      sessionId,
      type: "approval_granted",
      timestamp: new Date().toISOString(),
      payload: { approvalId: "apr_1", toolName: "write_file", surface: "desktop" },
    });
    await server.runtime.events.append({
      id: `evt_deny_${Date.now()}`,
      sessionId,
      type: "approval_denied",
      timestamp: new Date().toISOString(),
      payload: { approvalId: "apr_2", toolName: "delete_file", surface: "desktop" },
    });

    const res = await server.fastify.inject({ method: "GET", url: "/api/audit" });
    const body = JSON.parse(res.body);
    expect(
      body.events.some((e: any) => e.toolName === "write_file" && e.decision === "GRANTED")
    ).toBe(true);
    expect(
      body.events.some((e: any) => e.toolName === "delete_file" && e.decision === "DENIED")
    ).toBe(true);

    const filtered = await server.fastify.inject({
      method: "GET",
      url: `/api/audit?workId=${work.id}`,
    });
    const filteredBody = JSON.parse(filtered.body);
    expect(filteredBody.events.length).toBeGreaterThan(0);
    expect(filteredBody.events.every((e: any) => e.workId === work.id)).toBe(true);

    await server.close();
  });

  it("PATCH /api/config persists permissionRules and GET returns them", async () => {
    const { server } = makeServerWithConfigPath();

    const patchRes = await server.fastify.inject({
      method: "PATCH",
      url: "/api/config",
      payload: {
        permissionRules: {
          deny: ["delete_file"],
          allow: ["read_file"],
          dangerousCommands: ["rm -rf"],
        },
      },
    });
    expect(patchRes.statusCode).toBe(200);

    const getRes = await server.fastify.inject({ method: "GET", url: "/api/config" });
    const cfg = JSON.parse(getRes.body);
    expect(cfg.permissionRules.deny).toContain("delete_file");
    expect(cfg.permissionRules.allow).toContain("read_file");
    expect(cfg.permissionRules.dangerousCommands).toContain("rm -rf");

    await server.close();
  });
});

describe("Incognito work metadata (P1: per-Work no-memory)", () => {
  it("POST /api/works stores metadata and PATCH merges it shallowly", async () => {
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    const createRes = await server.fastify.inject({
      method: "POST",
      url: "/api/works",
      payload: {
        intent: "无痕测试",
        uiKind: "conversation",
        metadata: { incognito: true },
      },
    });
    expect(createRes.statusCode).toBe(200);
    const work = JSON.parse(createRes.body).work;
    expect(work.metadata?.incognito).toBe(true);

    // PATCH 只翻转 incognito → 其他元数据保持不变（浅合并）
    const patchRes = await server.fastify.inject({
      method: "PATCH",
      url: `/api/works/${work.id}`,
      payload: { title: "改名", metadata: { pinned: true } },
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = JSON.parse(patchRes.body).work;
    expect(patched.title).toBe("改名");
    expect(patched.metadata?.incognito).toBe(true);
    expect(patched.metadata?.pinned).toBe(true);

    // 关闭无痕
    const offRes = await server.fastify.inject({
      method: "PATCH",
      url: `/api/works/${work.id}`,
      payload: { metadata: { incognito: false } },
    });
    const off = JSON.parse(offRes.body).work;
    expect(off.metadata?.incognito).toBe(false);
    expect(off.metadata?.pinned).toBe(true);

    await server.close();
  });
});

describe("V1.2 Projects API", () => {
  it("import root → create/reuse project; works bind via projectId; delete unlinks", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hachimi-api-proj-"));
    const root = join(tmpDir, "demo-app");
    mkdirSync(root, { recursive: true });
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    try {
      // 1. 首次导入：创建项目
      const createRes = await server.fastify.inject({
        method: "POST",
        url: "/api/projects",
        payload: { root },
      });
      expect(createRes.statusCode).toBe(200);
      const { project, created } = JSON.parse(createRes.body);
      expect(created).toBe(true);
      // macOS /var -> /private/var 符号链接：断言规范化结果
      expect(project.workspaceRoot.endsWith("/demo-app")).toBe(true);

      // 2. 重复导入：幂等复用
      const againRes = await server.fastify.inject({
        method: "POST",
        url: "/api/projects",
        payload: { root },
      });
      const again = JSON.parse(againRes.body);
      expect(again.created).toBe(false);
      expect(again.project.id).toBe(project.id);

      // 3. 创建绑定项目的 Work（workspaceRoot 自动升级）
      const workRes = await server.fastify.inject({
        method: "POST",
        url: "/api/works",
        payload: { intent: "项目内第一个任务", workspaceRoot: root },
      });
      expect(workRes.statusCode).toBe(200);
      const work = JSON.parse(workRes.body).work;
      expect(work.projectId).toBe(project.id);

      // 4. 项目列表含 workCount（测试与真实 dataDir 共享，按 id 断言）
      const listRes = await server.fastify.inject({ method: "GET", url: "/api/projects" });
      const list = JSON.parse(listRes.body).projects;
      const mine = list.find((p: { id: string }) => p.id === project.id);
      expect(mine).toBeDefined();
      expect(mine.workCount).toBe(1);

      // 5. 项目详情含其下 Works
      const detailRes = await server.fastify.inject({
        method: "GET",
        url: `/api/projects/${project.id}`,
      });
      const detail = JSON.parse(detailRes.body);
      expect(detail.project.id).toBe(project.id);
      expect(detail.works.some((w: { id: string }) => w.id === work.id)).toBe(true);

      // 6. 清除 workspaceRoot → 解绑项目
      const unlinkRes = await server.fastify.inject({
        method: "PATCH",
        url: `/api/works/${work.id}`,
        payload: { workspaceRoot: "", uiKind: "conversation" },
      });
      const unlinked = JSON.parse(unlinkRes.body).work;
      expect(unlinked.workspaceRoot).toBeUndefined();
      expect(unlinked.projectId).toBeUndefined();

      // 7. 删除项目 → 项目记录删除，Work 保留
      const delRes = await server.fastify.inject({
        method: "DELETE",
        url: `/api/projects/${project.id}`,
      });
      expect(JSON.parse(delRes.body).success).toBe(true);
      const afterRes = await server.fastify.inject({ method: "GET", url: "/api/projects" });
      expect(
        JSON.parse(afterRes.body).projects.some((p: { id: string }) => p.id === project.id)
      ).toBe(false);
      const workAfterRes = await server.fastify.inject({
        method: "GET",
        url: `/api/works/${work.id}`,
      });
      expect(JSON.parse(workAfterRes.body).work).toBeDefined();
    } finally {
      await server.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("PATCH /api/projects/:id updates metadata", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hachimi-api-proj-patch-"));
    const root = join(tmpDir, "patch-app");
    mkdirSync(root, { recursive: true });
    const appContext = createAppContext({ providerOverride: "mock" });
    const server = createHachimiApiServer({ appContext });

    try {
      const createRes = await server.fastify.inject({
        method: "POST",
        url: "/api/projects",
        payload: { root },
      });
      const { project } = JSON.parse(createRes.body);

      const patchRes = await server.fastify.inject({
        method: "PATCH",
        url: `/api/projects/${project.id}`,
        payload: { name: "改名项目", description: "demo", color: "#6366f1" },
      });
      expect(patchRes.statusCode).toBe(200);
      const patched = JSON.parse(patchRes.body).project;
      expect(patched.name).toBe("改名项目");
      expect(patched.description).toBe("demo");
      expect(patched.color).toBe("#6366f1");
    } finally {
      await server.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
