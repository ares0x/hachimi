// packages/core/src/tools/builtin/web/web-search.ts

import { getDefaultCredentialStore } from "@hachimi/config";
import { extractReadableText } from "../../../extensions/mcp-builtin/fetch-mcp.js";
import type { ToolDefinition } from "../../types.js";

const DDG_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface SearchProvider {
  name: string;
  apiKey?: string;
}

/**
 * Pick the configured search provider, falling back to the first available key.
 * Keys resolve from the credential store (`api_key:tavily` etc.) first, then env vars.
 */
function resolveSearchProvider(): SearchProvider {
  const credStore = getDefaultCredentialStore();
  const configured = (process.env.HACHIMI_SEARCH_PROVIDER || "").toLowerCase().trim();
  const envKeys: Record<string, string | undefined> = {
    tavily: process.env.TAVILY_API_KEY,
    brave: process.env.BRAVE_API_KEY,
    exa: process.env.EXA_API_KEY,
    serper: process.env.SERPER_API_KEY,
  };
  const providers: SearchProvider[] = (["tavily", "brave", "exa", "serper"] as const).map(
    (name) => ({
      name,
      apiKey: credStore.getSecret(name, "api_key") || envKeys[name] || "",
    })
  );
  const byKey = providers.find((p) => p.apiKey);
  const byConfig = providers.find((p) => p.name === configured && p.apiKey);
  if (byConfig) return byConfig;
  if (byKey) return byKey;
  return { name: "duckduckgo" };
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchTavily(apiKey: string, query: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5, search_depth: "basic" }),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results || []).map((r) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.content || "",
  }));
}

async function searchBrave(apiKey: string, query: string): Promise<SearchResult[]> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    { headers: { "X-Subscription-Token": apiKey, Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return (data.web?.results || []).map((r) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.description || "",
  }));
}

async function searchExa(apiKey: string, query: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, numResults: 5, text: false }),
  });
  if (!res.ok) throw new Error(`Exa HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; text?: string }>;
  };
  return (data.results || []).map((r) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.text || "",
  }));
}

async function searchSerper(apiKey: string, query: string): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
  const data = (await res.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return (data.organic || []).map((r) => ({
    title: r.title || "",
    url: r.link || "",
    snippet: r.snippet || "",
  }));
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
    headers: { "User-Agent": DDG_UA },
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();
  const results: SearchResult[] = [];
  // Extract title + snippet pairs from the classic DDG HTML result layout.
  const blocks = html.split(/<div class="result[^"]*"/i).slice(1);
  for (const block of blocks) {
    if (results.length >= 5) break;
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/is);
    const snippetMatch = block.match(/class="result__snippet[^>]*>(.*?)<\/a>/is);
    const hrefMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"/i);
    if (!titleMatch && !snippetMatch) continue;
    const title = stripTags(titleMatch?.[1] || "");
    const snippet = stripTags(snippetMatch?.[1] || "");
    if (!title && !snippet) continue;
    let url = hrefMatch?.[1] || "";
    // DDG redirect links carry the target in the "uddg" query param.
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) {
      try {
        url = decodeURIComponent(uddg[1]);
      } catch {
        /* keep original */
      }
    }
    results.push({ title, url, snippet });
  }
  return results;
}

function stripTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
}

function formatResults(query: string, provider: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `[Web Search Result for "${query}"]:\nQuery processed via ${provider} but returned no results.`;
  }
  return (
    `[Web Search Results for "${query}" (via ${provider})]:\n` +
    results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet || "(no snippet)"}`)
      .join("\n")
  );
}

async function runSearch(query: string): Promise<string> {
  const provider = resolveSearchProvider();
  try {
    let results: SearchResult[] = [];
    switch (provider.name) {
      case "tavily":
        results = await searchTavily(provider.apiKey!, query);
        break;
      case "brave":
        results = await searchBrave(provider.apiKey!, query);
        break;
      case "exa":
        results = await searchExa(provider.apiKey!, query);
        break;
      case "serper":
        results = await searchSerper(provider.apiKey!, query);
        break;
      default:
        results = await searchDuckDuckGo(query);
    }
    return formatResults(query, provider.name, results);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // 明确的错误信号：让模型知道搜索不可用，尽早切换策略（如直连行情 API）
    return `[Error] Web search unavailable (${provider.name}): ${msg}`;
  }
}

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  kind: "read",
  group: "search",
  description:
    "Performs a web search query for latest information, documentation, or technical topics. " +
    "Configure a provider via HACHIMI_SEARCH_PROVIDER + <PROVIDER>_API_KEY (tavily/brave/exa/serper); " +
    "falls back to DuckDuckGo when no key is set.",
  permission: "safe",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term or question query" },
    },
    required: ["query"],
  },
  async execute(args) {
    const query = String(args.query ?? "").trim();
    if (!query) return "[Error] Query cannot be empty";
    return await runSearch(query);
  },
};
