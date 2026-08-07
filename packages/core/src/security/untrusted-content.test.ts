import { describe, expect, it } from "vitest";
import { ContextBuilder } from "../context/builder.js";
import type { Message } from "../types/index.js";
import {
  isUntrustedTool,
  wrapToolResultIfUntrusted,
  wrapUntrustedContent,
} from "./untrusted-content.js";

describe("untrusted-content", () => {
  it("recognizes web and MCP tools as untrusted", () => {
    expect(isUntrustedTool("web_search")).toBe(true);
    expect(isUntrustedTool("stock_quote")).toBe(true);
    expect(isUntrustedTool("mcp_github_get_file")).toBe(true);
    expect(isUntrustedTool("mcp__server_tool")).toBe(true);
  });

  it("keeps local tools untagged", () => {
    expect(isUntrustedTool("read_file")).toBe(false);
    expect(isUntrustedTool("run_command")).toBe(false);
    expect(isUntrustedTool(undefined)).toBe(false);
  });

  it("wraps untrusted tool output with a source tag", () => {
    const wrapped = wrapToolResultIfUntrusted("web_search", "1. snippet");
    expect(wrapped).toContain('<untrusted-content source="web_search">');
    expect(wrapped).toContain("1. snippet");
    expect(wrapped).toContain("</untrusted-content>");
  });

  it("escapes quotes in the source attribute", () => {
    const wrapped = wrapUntrustedContent("x", 'mcp_"evil"');
    expect(wrapped).not.toContain('source="mcp_"evil""');
    expect(wrapped).toContain("&quot;");
  });

  it("leaves local tool output untouched", () => {
    expect(wrapToolResultIfUntrusted("read_file", "content")).toBe("content");
  });
});

describe("ContextBuilder untrusted tagging", () => {
  it("tags web_search tool results at the context seam", async () => {
    const builder = new ContextBuilder();
    const messages: Message[] = [
      { id: "m1", role: "user", content: "search", timestamp: 1 },
      {
        id: "m2",
        role: "tool",
        name: "web_search",
        tool_call_id: "c1",
        content: "snippet from the internet",
        timestamp: 2,
      },
      { id: "m3", role: "assistant", content: "done", timestamp: 3 },
    ];

    const built = await builder.build({
      history: messages,
      options: { maxTokens: 8000, mode: "normal", enableTokenTruncation: true },
    });

    expect(built.systemPrompt).toContain('<untrusted-content source="web_search">');
  });

  it("does not tag local read_file tool results", async () => {
    const builder = new ContextBuilder();
    const messages: Message[] = [
      { id: "m1", role: "user", content: "read", timestamp: 1 },
      {
        id: "m2",
        role: "tool",
        name: "read_file",
        tool_call_id: "c1",
        content: "local file contents",
        timestamp: 2,
      },
      { id: "m3", role: "assistant", content: "done", timestamp: 3 },
    ];

    const built = await builder.build({
      history: messages,
      options: { maxTokens: 8000, mode: "normal", enableTokenTruncation: true },
    });

    expect(built.systemPrompt).not.toContain("untrusted-content");
  });
});
