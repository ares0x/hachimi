import type { McpToolDefinition } from "../mcp-types.js";

/**
 * Built-in Fetch & Web Content Reader MCP Tool.
 * Fetches web content via HTTP request and converts HTML into clean markdown text for LLM consumption.
 */
export const fetchMcpTool: McpToolDefinition = {
  name: "mcp_fetch_url",
  description:
    "Fetch web page content via HTTP GET request and return simplified text/markdown representation.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Target HTTP or HTTPS URL to fetch" },
    },
    required: ["url"],
  },
  handler: async (args) => {
    const url = (args?.url as string)?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return {
        isError: true,
        content: [{ type: "text", text: "Invalid URL: Must be a valid HTTP or HTTPS address." }],
      };
    }

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Hachimi/0.1.0 (Personal AI Harness; +https://hachimi.local)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        },
      });

      if (!res.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `HTTP error ${res.status}: ${res.statusText} when fetching ${url}`,
            },
          ],
        };
      }

      const html = await res.text();
      // Basic HTML to readable markdown text conversion
      const cleanText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, "\n")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();

      const truncated =
        cleanText.length > 12000 ? `${cleanText.slice(0, 12000)}\n\n…[内容已截断]` : cleanText;

      return {
        content: [
          {
            type: "text",
            text: `Source URL: ${url}\n\n${truncated}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Failed to fetch URL ${url}: ${err.message || String(err)}` },
        ],
      };
    }
  },
};
