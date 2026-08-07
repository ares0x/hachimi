import { afterEach, describe, expect, it, vi } from "vitest";
import { testConnection } from "./connection-tester.js";
import type { LlmConnection } from "./index.js";

function deepseekConn(overrides: Partial<LlmConnection> = {}): LlmConnection {
  return {
    id: "deepseek",
    name: "DeepSeek",
    providerType: "deepseek",
    enabled: true,
    baseUrl: "https://api.deepseek.com",
    defaultModelId: "deepseek-v4-flash",
    models: ["deepseek-v4-flash"],
    enabledModels: ["deepseek-v4-flash"],
    apiKey: "sk-test",
    ...overrides,
  };
}

describe("testConnection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("probes the Responses API endpoint when serverWebSearch is enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await testConnection(deepseekConn({ serverWebSearch: true }));

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/responses");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.input).toBe("ping");
  });

  it("maps 401 from the Responses probe to auth failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }))
    );

    const result = await testConnection(deepseekConn({ serverWebSearch: true }));

    expect(result.success).toBe(false);
    expect(result.failureCategory).toBe("auth");
    expect(result.errorMessage).toContain("401");
  });

  it("still uses GET /models when serverWebSearch is off", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "deepseek-chat" }] }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await testConnection(deepseekConn());
    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/models");
  });
});

const FAKE_ACP_AGENT = `
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {
      protocolVersion: 2,
      capabilities: { session: { prompt: { image: true }, mcp: { stdio: true } } },
      info: { name: "fake-acp-agent", version: "1.0.0" },
      authMethods: [],
    } }) + "\\n");
  }
});
`;

describe("testConnection ACP client", () => {
  it("probes an external ACP agent process via initialize handshake", async () => {
    const conn: LlmConnection = {
      id: "acp",
      name: "ACP Agent",
      providerType: "acp",
      enabled: true,
      command: process.execPath,
      commandArgs: ["-e", FAKE_ACP_AGENT],
      defaultModelId: "external-agent",
      models: ["external-agent"],
      enabledModels: ["external-agent"],
    };

    const result = await testConnection(conn);

    expect(result.success).toBe(true);
  });

  it("fails fast when the ACP connection has no command", async () => {
    const conn: LlmConnection = {
      id: "acp",
      name: "ACP Agent",
      providerType: "acp",
      enabled: true,
      defaultModelId: "external-agent",
      models: ["external-agent"],
      enabledModels: ["external-agent"],
    };

    const result = await testConnection(conn);

    expect(result.success).toBe(false);
    expect(result.failureCategory).toBe("provider_unavailable");
  });

  it("reports an error when the ACP process exits before initialize", async () => {
    const conn: LlmConnection = {
      id: "acp",
      name: "ACP Agent",
      providerType: "acp",
      enabled: true,
      command: process.execPath,
      commandArgs: ["-e", "process.exit(3)"],
      defaultModelId: "external-agent",
      models: ["external-agent"],
      enabledModels: ["external-agent"],
    };

    const result = await testConnection(conn);

    expect(result.success).toBe(false);
    expect(result.failureCategory).toBe("provider_unavailable");
  });
});
