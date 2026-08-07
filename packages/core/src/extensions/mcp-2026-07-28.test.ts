import { describe, expect, it, vi } from "vitest";
import { McpClientManager } from "./mcp-client.js";
import { StatelessHttpTransport } from "./mcp-transports.js";

describe("MCP 2026-07-28 Stateless HTTP & Dual-Version Transport Suite", () => {
  it("instantiates StatelessHttpTransport for 2026-07-28 protocol version", () => {
    const manager = new McpClientManager();
    const transport = manager.registerServer("enterprise_server", {
      url: "https://api.enterprise.com/mcp",
      protocolVersion: "2026-07-28",
    });

    expect(transport.version).toBe("2026-07-28");
    expect(transport).toBeInstanceOf(StatelessHttpTransport);
  });

  it("sends 2026-07-28 stateless _meta payload and parses MRTR responses", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      const headers = init?.headers || {};
      const method = headers["Mcp-Method"];

      if (method === "server/discover") {
        return {
          ok: true,
          json: async () => ({
            protocolVersion: "2026-07-28",
            supportedVersions: ["2026-07-28"],
          }),
        };
      }

      if (method === "tools/call") {
        const body = JSON.parse(init.body);
        expect(body._meta.protocolVersion).toBe("2026-07-28");

        if (body.name === "need_more_input") {
          return {
            ok: true,
            json: async () => ({
              resultType: "input_required",
              requiredInputKey: "user_confirm",
              promptMessage: "Please confirm your action.",
            }),
          };
        }

        return {
          ok: true,
          json: async () => ({
            resultType: "success",
            content: "Execution output from MCP 2026-07-28 server",
          }),
        };
      }

      return { ok: false, status: 404 };
    });

    const transport = new StatelessHttpTransport({ url: "https://mcp.test.com" }, mockFetch as any);

    const discover = await transport.discover();
    expect(discover.protocolVersion).toBe("2026-07-28");

    const result = await transport.callTool("query_db", { sql: "SELECT 1" });
    expect(result).toContain("Execution output from MCP 2026-07-28 server");

    const mrtrResult = await transport.callTool("need_more_input", {});
    expect(mrtrResult).toContain("[MCP 2026-07-28 MRTR]");
  });
});
