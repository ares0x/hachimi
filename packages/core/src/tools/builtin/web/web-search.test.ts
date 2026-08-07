// packages/core/src/tools/builtin/web/web-search.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { webSearchTool } from "./web-search.js";

const DDG_HTML = `
<html><body>
<div class="result results_links">
  <a class="result__a" href="https://example.com/?uddg=https%3A%2F%2Fgold.example.com%2Fprice">Gold Price Today</a>
  <a class="result__snippet">Latest gold price is $4,273 per ounce.</a>
</div>
<div class="result results_links">
  <a class="result__a" href="https://example2.com/">Silver Price</a>
  <a class="result__snippet">Silver is up today.</a>
</div>
</body></html>`;

describe("web_search tool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns an error for an empty query", async () => {
    const res = await webSearchTool.execute({ query: "   " });
    expect(res).toContain("[Error]");
  });

  it("falls back to DuckDuckGo and parses results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(DDG_HTML, { status: 200 })));

    const res = await webSearchTool.execute({ query: "今日金价" });
    expect(res).toContain("via duckduckgo");
    expect(res).toContain("Gold Price Today");
    expect(res).toContain("gold.example.com/price");
    expect(res).toContain("Latest gold price is $4,273 per ounce.");
  });

  it("returns a clear [Error] when the provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));

    const res = await webSearchTool.execute({ query: "金价" });
    expect(res).toContain("[Error] Web search unavailable (duckduckgo)");
    expect(res).toContain("ECONNRESET");
  });

  it("uses Tavily when configured via env", async () => {
    vi.stubEnv("HACHIMI_SEARCH_PROVIDER", "tavily");
    vi.stubEnv("TAVILY_API_KEY", "sk-test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Gold API",
              url: "https://api.gold-api.com/price/XAU",
              content: "XAU $4,273.90",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await webSearchTool.execute({ query: "gold price" });
    expect(res).toContain("via tavily");
    expect(res).toContain("Gold API");
    expect(res).toContain("XAU $4,273.90");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://api.tavily.com/search");
    expect(JSON.parse(String(init.body)).query).toBe("gold price");
  });
});
