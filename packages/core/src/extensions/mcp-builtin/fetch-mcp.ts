import { decodeResponseBody } from "../../tools/builtin/web/charset.js";
import type { McpToolDefinition } from "../mcp-types.js";

/**
 * Extract readable main content from HTML using lightweight heuristics
 * (article/main/pre blocks first, fall back to generic tag stripping).
 */
export function extractReadableText(html: string): string {
  // 1. Try semantic containers first — much better signal than stripping all tags
  const containerPatterns = [
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<pre\b[^>]*>([\s\S]*?)<\/pre>/i,
    /<div[^>]*class="[^"]*(?:markdown|gist|readme|content|body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const pattern of containerPatterns) {
    const match = html.match(pattern);
    if (match && match[1] && match[1].length > 200) {
      html = match[1];
      break;
    }
  }

  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Fetch a GitHub gist's content — gist pages are client-rendered, so we use
 * the raw endpoint (gist.githubusercontent.com) first, then API as fallback.
 * Accepts: https://gist.github.com/<user>/<id> or https://gist.github.com/<id>
 */
async function fetchGistContent(url: string): Promise<string> {
  const idMatch = url.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]{7,32})/i);
  if (!idMatch) return "";
  const gistId = idMatch[1];

  // Extract user from URL if present; otherwise follow redirect once to discover it
  const userMatch = url.match(/gist\.github\.com\/([^/]+)\/([a-f0-9]{7,32})/i);
  let user = userMatch?.[1] || "";
  if (!user) {
    try {
      const probe = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      user = probe.url.match(/gist\.github\.com\/([^/]+)\//i)?.[1] || "";
    } catch {
      /* ignore — will try API fallback */
    }
  }

  // Strategy 1: raw.githubusercontent-style gist raw endpoint (works without API key)
  if (user) {
    try {
      const raw = await fetch(`https://gist.githubusercontent.com/${user}/${gistId}/raw`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      if (raw.ok) {
        const text = await raw.text();
        if (text.trim()) return text;
      }
    } catch {
      /* fall through to API */
    }
  }

  // Strategy 2: GitHub API (multi-file gists with filenames)
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { "User-Agent": "Hachimi/0.1.0", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`);

  const data = (await res.json()) as {
    description?: string;
    files?: Record<string, { filename?: string; content?: string; truncated?: boolean }>;
  };
  const files = data.files || {};
  const fileNames = Object.keys(files);
  if (fileNames.length === 0) return "Gist is empty.";

  const parts = [`Gist: ${data.description || "(no description)"}`];
  for (const name of fileNames) {
    const f = files[name];
    const content = f.content || "";
    parts.push(`\n=== ${f.filename || name} ===\n${content}`);
  }
  return parts.join("\n");
}

/**
 * Fetch raw content from github.com pages via raw.githubusercontent.com
 * when the HTML page is JS-rendered and yields no useful body.
 */
async function fetchGithubRawFallback(url: string): Promise<string> {
  // Only for /blob/ URLs: https://github.com/<user>/<repo>/blob/<branch>/<path>
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/i);
  if (!match) return "";
  const [, user, repo, branch, path] = match;
  const res = await fetch(`https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`, {
    headers: { "User-Agent": "Hachimi/0.1.0" },
  });
  if (!res.ok) return "";
  return res.text();
}

/**
 * Built-in Fetch & Web Content Reader MCP Tool.
 * Fetches web content via HTTP and converts HTML into clean markdown text.
 * Includes special handling for JS-rendered sites (GitHub gist/github) via API fallbacks.
 */
export const fetchMcpTool: McpToolDefinition = {
  name: "mcp_fetch_url",
  description:
    "Fetch a web page's content and return it as readable text/markdown. Works for articles, docs, and code. Handles GitHub gists and GitHub files via API fallback.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Target HTTP or HTTPS URL to fetch" },
      maxChars: {
        type: "number",
        description: "Optional max chars to return (default 20000)",
      },
      headers: {
        type: "object",
        description:
          'Optional HTTP headers (e.g. {"Referer": "https://...", "Authorization": "Bearer ..."}). ' +
          "Some quote/news sites require a Referer header.",
        additionalProperties: { type: "string" },
      },
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
    const maxChars = typeof args?.maxChars === "number" ? args.maxChars : 20000;
    const extraHeaders = (args?.headers ?? {}) as Record<string, string>;

    try {
      // 1. Gist special case — gist pages are client-rendered, use GitHub API
      if (/gist\.github\.com\//i.test(url)) {
        const gistText = await fetchGistContent(url);
        if (gistText) {
          return {
            content: [
              {
                type: "text",
                text: `Source URL: ${url}\n\n${gistText.slice(0, maxChars)}`,
              },
            ],
          };
        }
      }

      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          ...extraHeaders,
        },
        redirect: "follow",
      });

      if (!res.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `HTTP error ${res.status}: ${res.statusText} when fetching ${url}. ` +
                `This may be anti-bot protection or rate limiting — try again later, ` +
                `use web_search, or retry with custom headers.`,
            },
          ],
        };
      }

      const contentType = res.headers.get("content-type") || "";
      const body = await decodeResponseBody(res);

      // 2. If it's a GitHub blob page that rendered as a JS shell, use raw fallback
      if (/github\.com\//i.test(url) && body.length < 500) {
        const raw = await fetchGithubRawFallback(url);
        if (raw) {
          return {
            content: [{ type: "text", text: `Source URL: ${url}\n\n${raw.slice(0, maxChars)}` }],
          };
        }
      }

      // 3. Plain text / JSON content
      if (contentType.includes("text/plain") || contentType.includes("application/json")) {
        return {
          content: [{ type: "text", text: `Source URL: ${url}\n\n${body.slice(0, maxChars)}` }],
        };
      }

      // 4. HTML → readable extraction
      const cleanText = extractReadableText(body);
      const truncated =
        cleanText.length > maxChars
          ? `${cleanText.slice(0, maxChars - 200)}\n\n…[内容已截断]`
          : cleanText;

      return {
        content: [{ type: "text", text: `Source URL: ${url}\n\n${truncated}` }],
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
