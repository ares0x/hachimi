// packages/core/src/tools/builtin/web/browser-engine.ts
import { log } from "@hachimi/shared";
import { decodeResponseBody } from "./charset.js";

export interface BrowserEngineConfig {
  headless: boolean;
  viewport?: { width: number; height: number };
}

/** 引擎模式：static-fetch = 静态 HTML 抓取（无 JS、无交互）；playwright = 真实浏览器（未来接入） */
export type BrowserEngineMode = "static-fetch" | "playwright";

export interface BrowserSnapshotResult {
  url: string;
  title: string;
  textSummary: string;
  screenshotBase64?: string;
  /** 当前引擎模式；static-fetch 下交互类工具不可用 */
  mode: BrowserEngineMode;
}

/**
 * Session-scoped Browser Engine wrapper.
 *
 * 当前实现为 static-fetch（诚实）模式：
 * - navigate: fetch 原始 HTML，不执行 JavaScript —— SPA（React/Vue）只能拿到空壳
 * - snapshot: 清理静态 HTML 文本；空内容提示可能依赖 JS 渲染
 * - click / typeText / waitFor: 交互类操作在该模式下不支持，返回明确错误，
 *   绝不模拟成功（避免误导模型产生"已输入/已点击"的幻觉）
 *
 * 接入真实浏览器（Playwright）后通过 setMode("playwright") 切换，交互类工具才可用。
 */
export class BrowserEngine {
  private static instance: BrowserEngine | null = null;
  private isHeadless = true;
  private mode: BrowserEngineMode = "static-fetch";
  private activeUrl = "";
  private activeTitle = "";
  private activeContent = "";

  static getInstance(): BrowserEngine {
    if (!BrowserEngine.instance) {
      BrowserEngine.instance = new BrowserEngine();
    }
    return BrowserEngine.instance;
  }

  setHeadless(headless: boolean): void {
    this.isHeadless = headless;
  }

  getHeadless(): boolean {
    return this.isHeadless;
  }

  setMode(mode: BrowserEngineMode): void {
    this.mode = mode;
  }

  getMode(): BrowserEngineMode {
    return this.mode;
  }

  /** 交互类操作在 static-fetch 模式下不支持 —— 返回明确错误而非模拟成功 */
  private unsupported(action: string): string {
    return (
      `[Browser Unsupported] ${action} requires a real (Playwright) browser engine. ` +
      `Current mode is "static-fetch" (raw HTML only, no JS execution, no DOM interaction). ` +
      `Use web_search or mcp_fetch_url to get content from JS-rendered sites instead.`
    );
  }

  async navigate(url: string, timeoutMs = 30000): Promise<{ url: string; title: string }> {
    this.activeUrl = url;
    log("info", `[BrowserEngine] [static-fetch] Fetching raw HTML from ${url} (no JS execution)`);

    try {
      // Fetch fallback for static/SSR rendering if playwright is absent
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      const html = await decodeResponseBody(response);
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      this.activeTitle = titleMatch ? titleMatch[1].trim() : url;

      // Clean HTML tags into text summary
      this.activeContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return { url: this.activeUrl, title: this.activeTitle };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.activeTitle = "Error Loading Page";
      this.activeContent = `Failed to load ${url}: ${msg}`;
      return { url: this.activeUrl, title: this.activeTitle };
    }
  }

  async snapshot(fullPage = false): Promise<BrowserSnapshotResult> {
    const content = this.activeContent.slice(0, 4000) || "No page content loaded yet.";
    // 静态抓取模式下内容为空：通常是 JS 渲染的 SPA（小红书、各类社交/搜索站点）
    const hint =
      this.activeContent.length === 0 && this.activeUrl
        ? "\n\n[static-fetch hint] This page returned no static text — it is likely a JS-rendered SPA " +
          "(e.g. social apps) that requires a real browser or login. Prefer web_search / mcp_fetch_url."
        : "";
    return {
      url: this.activeUrl || "about:blank",
      title: this.activeTitle || "Blank Page",
      textSummary: content + hint,
      mode: this.mode,
    };
  }

  async click(selector?: string, coordinate?: { x: number; y: number }): Promise<string> {
    const loc = selector
      ? `selector "${selector}"`
      : `coordinate (${coordinate?.x}, ${coordinate?.y})`;
    log("warn", `[BrowserEngine] browser_click rejected (static-fetch mode): ${loc}`);
    return this.unsupported("browser_click");
  }

  async typeText(selector: string, text: string, clearFirst = true): Promise<string> {
    log("warn", `[BrowserEngine] browser_type rejected (static-fetch mode): "${selector}"`);
    return this.unsupported("browser_type");
  }

  async waitFor(selector?: string, timeoutMs = 10000): Promise<string> {
    log(
      "warn",
      `[BrowserEngine] browser_wait rejected (static-fetch mode): ${selector || "navigation"}`
    );
    return this.unsupported("browser_wait");
  }
}

export const browserEngine = BrowserEngine.getInstance();
