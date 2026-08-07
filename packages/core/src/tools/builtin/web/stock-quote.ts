// packages/core/src/tools/builtin/web/stock-quote.ts
import type { ToolDefinition } from "../../types.js";
import { decodeResponseBody } from "./charset.js";

export type QuoteMarket = "HK" | "SH" | "SZ" | "US";
export type QuoteProviderId = "yahoo" | "tencent" | "stooq";
export type QuoteState = "open" | "closed" | "pre" | "post" | "unknown";

export interface NormalizedSymbol {
  /** Numeric code or ticker, uppercase (e.g. "6963", "600519", "AAPL"). */
  base: string;
  market: QuoteMarket;
  /** Canonical display form (e.g. "6963.HK", "600519.SS", "AAPL"). */
  display: string;
  /** Symbol form per provider. */
  yahoo: string;
  tencent: string;
  stooq: string;
}

export interface QuoteData {
  provider: QuoteProviderId;
  symbol: string;
  name: string;
  currency: string;
  price: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  turnover: number | null;
  /** ISO 8601 UTC when the quote was last traded (null if unknown). */
  quoteTimeIso: string | null;
  marketState: QuoteState;
  notes: string[];
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// ─── Symbol normalization ───────────────────────────────────────────────────

function buildSymbol(base: string, market: QuoteMarket): NormalizedSymbol {
  const code = base.toUpperCase();
  switch (market) {
    case "HK":
      return {
        base: code,
        market,
        display: `${code.padStart(4, "0")}.HK`,
        yahoo: `${code.padStart(4, "0")}.HK`,
        tencent: `hk${code.padStart(5, "0")}`,
        stooq: `${code.toLowerCase()}.hk`,
      };
    case "SH":
      return {
        base: code,
        market,
        display: `${code}.SS`,
        yahoo: `${code}.SS`,
        tencent: `sh${code}`,
        stooq: `${code}.cn`,
      };
    case "SZ":
      return {
        base: code,
        market,
        display: `${code}.SZ`,
        yahoo: `${code}.SZ`,
        tencent: `sz${code}`,
        stooq: `${code}.cn`,
      };
    case "US":
      return {
        base: code,
        market,
        display: code,
        yahoo: code,
        tencent: `us${code}`,
        stooq: `${code.toLowerCase()}.us`,
      };
  }
}

function cnMarketFromCode(code: string): QuoteMarket {
  return code.startsWith("6") ? "SH" : "SZ";
}

/**
 * Normalize a user-provided symbol into per-provider forms.
 * Returns an error string when the input cannot be interpreted.
 */
export function normalizeSymbol(input: string): NormalizedSymbol | string {
  const raw = (input ?? "").trim().toUpperCase();
  if (!raw) return "[Error] Symbol cannot be empty";

  const withSuffix = raw.match(/^([A-Z0-9.]+)\.(HK|SH|SS|SZ|US)$/);
  if (withSuffix) {
    const [, code, suffix] = withSuffix;
    const market = suffix === "SS" ? "SH" : (suffix as QuoteMarket);
    return buildSymbol(code, market);
  }

  const hk = raw.match(/^\d{1,5}$/);
  if (hk) return buildSymbol(raw, "HK");

  const cn = raw.match(/^\d{6}$/);
  if (cn) return buildSymbol(raw, cnMarketFromCode(raw));

  const ticker = raw.match(/^[A-Z][A-Z0-9-]{0,9}$/);
  if (ticker) return buildSymbol(raw, "US");

  return `[Error] Unrecognized symbol "${input}". Supported formats: 6963.HK, 600519.SS, 000001.SZ, AAPL.`;
}

// ─── Market-state heuristic ─────────────────────────────────────────────────

function zonedTimeParts(iso: string, tz: string): { date: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return { date, minutes };
}

/**
 * Approximate market state from the last-trade time.
 * Same exchange-local calendar day + inside trading hours ⇒ open; otherwise closed.
 * Only a hint — Yahoo reports an authoritative marketState when available.
 */
export function quoteMarketState(
  quoteTimeIso: string,
  market: QuoteMarket,
  nowIso = new Date().toISOString()
): QuoteState {
  const tz = market === "US" ? "America/New_York" : "Asia/Shanghai";
  const q = zonedTimeParts(quoteTimeIso, tz);
  const n = zonedTimeParts(nowIso, tz);
  if (q.date !== n.date) return "closed";
  return q.minutes >= 9 * 60 + 30 && q.minutes <= 16 * 60 ? "open" : "closed";
}

// ─── Provider parsers ───────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Parse a timestamp to ISO 8601 UTC, returning null instead of throwing on garbage. */
function toIsoOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function lastNonNull(arr: Array<number | null> | undefined): number | null {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null && arr[i] !== undefined) return arr[i];
  }
  return null;
}

interface YahooChartMeta {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  marketState?: string;
  regularMarketPrice?: number | null;
  regularMarketTime?: number | null;
  previousClose?: number | null;
  chartPreviousClose?: number | null;
}

async function quoteFromYahoo(sym: NormalizedSymbol, timeoutMs: number): Promise<QuoteData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym.yahoo)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: YahooChartMeta;
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
    };
  };
  const meta = json.chart?.result?.[0]?.meta;
  const quote = json.chart?.result?.[0]?.indicators?.quote?.[0];
  if (!meta || !quote) throw new Error("Yahoo returned no chart data");
  const price = toNum(meta.regularMarketPrice);
  if (price === null) throw new Error("Yahoo has no current price for this symbol");

  const prevClose = toNum(meta.chartPreviousClose ?? meta.previousClose);
  const state = (meta.marketState || "").toUpperCase();
  const marketState: QuoteState =
    state === "REGULAR" || state === "OPEN"
      ? "open"
      : state === "PRE"
        ? "pre"
        : state === "POST"
          ? "post"
          : state === "CLOSED"
            ? "closed"
            : "unknown";

  return {
    provider: "yahoo",
    symbol: sym.display,
    name: meta.fullExchangeName || meta.exchangeName || sym.display,
    currency: meta.currency || "USD",
    price,
    prevClose,
    change: prevClose !== null ? round2(price - prevClose) : null,
    changePct:
      prevClose !== null && prevClose !== 0
        ? round2(((price - prevClose) / prevClose) * 100)
        : null,
    open: lastNonNull(quote.open),
    high: lastNonNull(quote.high),
    low: lastNonNull(quote.low),
    volume: lastNonNull(quote.volume),
    turnover: null,
    quoteTimeIso: toIsoOrNull(meta.regularMarketTime ? meta.regularMarketTime * 1000 : null),
    marketState,
    notes: [`Source: Yahoo Finance (${meta.exchangeName || "exchange"})`],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const TENCENT_FIELD = {
  name: 1,
  code: 2,
  price: 3,
  prevClose: 4,
  open: 5,
  volume: 6,
  time: 30,
  change: 31,
  changePct: 32,
  high: 33,
  low: 34,
  turnover: 37,
  pe: 39,
  marketCapYi: 44,
  week52High: 47,
  week52Low: 48,
  totalShares: 71,
  floatShares: 72,
  currency: 77,
} as const;

async function quoteFromTencent(sym: NormalizedSymbol, timeoutMs: number): Promise<QuoteData> {
  const url = `https://qt.gtimg.cn/q=${encodeURIComponent(sym.tencent)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Tencent HTTP ${res.status}`);
  const text = await decodeResponseBody(res);
  const match = text.match(/v_[\w]+="([^"]*)"/);
  if (!match) throw new Error("Tencent returned no quote data");
  const f = match[1].split("~");
  if (f.length < 60) throw new Error("Tencent returned malformed quote data");

  const price = toNum(f[TENCENT_FIELD.price]);
  if (price === null) throw new Error("Tencent has no current price for this symbol");
  const prevClose = toNum(f[TENCENT_FIELD.prevClose]);
  const rawTime = f[TENCENT_FIELD.time] ?? ""; // "2026/08/06 16:08:38" (Asia/Shanghai)
  const quoteTimeIso = rawTime ? toIsoOrNull(`${rawTime.replace(/\//g, "-")}+08:00`) : null;
  const currency = (f[TENCENT_FIELD.currency] || "").trim() || inferCurrency(sym.market);
  const pe = toNum(f[TENCENT_FIELD.pe]);
  const week52High = toNum(f[TENCENT_FIELD.week52High]);
  const week52Low = toNum(f[TENCENT_FIELD.week52Low]);
  const marketCapYi = toNum(f[TENCENT_FIELD.marketCapYi]);
  // Tencent units differ by market: A-shares report volume in lots (手, ×100 shares)
  // and turnover in 万元 (×10,000 CNY); HK reports shares and raw HKD.
  const isCn = sym.market === "SH" || sym.market === "SZ";
  const volumeRaw = toNum(f[TENCENT_FIELD.volume]);
  const turnoverRaw = toNum(f[TENCENT_FIELD.turnover]);
  const totalShares = toNum(f[TENCENT_FIELD.totalShares]);

  const notes: string[] = [];
  if (pe !== null) notes.push(`PE ${pe}`);
  if (week52High !== null && week52Low !== null) notes.push(`52w ${week52Low}-${week52High}`);
  if (marketCapYi !== null && marketCapYi > 0)
    notes.push(`Market Cap ${fmtNum(marketCapYi)}亿 ${currency}`);
  if (totalShares !== null && totalShares > 0) {
    notes.push(`Total Shares ${fmtInt(totalShares)} (${(totalShares / 1e8).toFixed(2)}亿)`);
  }
  notes.push(`Source: Tencent Quotes (${sym.tencent})`);

  return {
    provider: "tencent",
    symbol: sym.display,
    name: (f[TENCENT_FIELD.name] || sym.display).trim(),
    currency,
    price,
    prevClose,
    change: toNum(f[TENCENT_FIELD.change]),
    changePct: toNum(f[TENCENT_FIELD.changePct]),
    open: toNum(f[TENCENT_FIELD.open]),
    high: toNum(f[TENCENT_FIELD.high]),
    low: toNum(f[TENCENT_FIELD.low]),
    volume: volumeRaw !== null ? (isCn ? volumeRaw * 100 : volumeRaw) : null,
    turnover: turnoverRaw !== null ? (isCn ? turnoverRaw * 10000 : turnoverRaw) : null,
    quoteTimeIso,
    marketState: quoteTimeIso ? quoteMarketState(quoteTimeIso, sym.market) : "unknown",
    notes,
  };
}

function inferCurrency(market: QuoteMarket): string {
  switch (market) {
    case "HK":
      return "HKD";
    case "SH":
    case "SZ":
      return "CNY";
    default:
      return "USD";
  }
}

const STOOQ_COLUMNS = ["symbol", "date", "time", "open", "high", "low", "close", "volume"] as const;

async function quoteFromStooq(sym: NormalizedSymbol, timeoutMs: number): Promise<QuoteData> {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(sym.stooq)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("Stooq returned no quote data");
  const header = lines[0]
    .toLowerCase()
    .split(",")
    .map((c) => c.trim());
  const row = lines[1].split(",").map((c) => c.trim());

  const get = (col: string): string => {
    const idx = header.indexOf(col);
    return idx >= 0 ? (row[idx] ?? "") : "";
  };
  const price = toNum(get("close"));
  if (price === null) throw new Error("Stooq has no current price for this symbol");
  const date = get("date");
  const time = get("time");
  const rawTime = date && time ? `${date} ${time}` : date || null;

  const notes: string[] = [];
  notes.push("Stooq does not provide previous close / change percent");
  if (rawTime) notes.push(`Last trade ${rawTime} (time as reported by stooq)`);
  notes.push("Source: Stooq CSV");

  return {
    provider: "stooq",
    symbol: sym.display,
    name: sym.stooq.toUpperCase(),
    currency: inferCurrency(sym.market),
    price,
    prevClose: null,
    change: null,
    changePct: null,
    open: toNum(get("open")),
    high: toNum(get("high")),
    low: toNum(get("low")),
    volume: toNum(get("volume")),
    turnover: null,
    quoteTimeIso: null,
    marketState: "unknown",
    notes,
  };
}

// ─── Orchestration ──────────────────────────────────────────────────────────

const PROVIDERS: Record<
  QuoteProviderId,
  (sym: NormalizedSymbol, timeoutMs: number) => Promise<QuoteData>
> = {
  yahoo: quoteFromYahoo,
  tencent: quoteFromTencent,
  stooq: quoteFromStooq,
};

function resolveOrder(market: QuoteMarket, provider?: string): QuoteProviderId[] {
  const requested = (provider || "").toLowerCase();
  const preferred: QuoteProviderId[] =
    market === "HK" || market === "SH" || market === "SZ"
      ? ["tencent", "yahoo", "stooq"]
      : ["yahoo", "stooq", "tencent"];
  if (!requested || requested === "auto" || !(requested in PROVIDERS)) return preferred;
  return [requested as QuoteProviderId, ...preferred.filter((p) => p !== requested)];
}

function fmtNum(n: number | null, digits = 2): string {
  return n === null ? "n/a" : n.toFixed(digits);
}

function fmtInt(n: number | null): string {
  return n === null ? "n/a" : Math.round(n).toLocaleString("en-US");
}

export function formatQuote(q: QuoteData): string {
  const lines = [
    `[Stock Quote] ${q.symbol} · ${q.name}`,
    `  Price: ${q.currency} ${fmtNum(q.price)}${q.prevClose !== null ? `  (prev close ${fmtNum(q.prevClose)})` : ""}`,
    `  Change: ${q.change !== null ? (Math.abs(q.change) < 1 ? fmtNum(q.change, 3) : fmtNum(q.change)) : "n/a"} (${q.changePct !== null ? fmtNum(q.changePct) : "n/a"}%)`,
    `  Open: ${fmtNum(q.open)} | High: ${fmtNum(q.high)} | Low: ${fmtNum(q.low)}`,
    `  Volume: ${fmtInt(q.volume)}${q.turnover !== null ? ` | Turnover: ${q.currency} ${fmtInt(q.turnover)}` : ""}`,
  ];
  if (q.quoteTimeIso) {
    const local = new Date(q.quoteTimeIso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    lines.push(`  Market: ${q.marketState} — last trade ${local} (UTC ${q.quoteTimeIso})`);
  } else {
    lines.push(`  Market: ${q.marketState}`);
  }
  if (q.notes.length > 0) {
    lines.push(`  ${q.notes.join(" | ")}`);
  }
  return lines.join("\n");
}

async function fetchQuote(
  sym: NormalizedSymbol,
  provider?: string,
  timeoutMs = 15000
): Promise<string> {
  const order = resolveOrder(sym.market, provider);
  const errors: string[] = [];
  for (const id of order) {
    try {
      const quote = await PROVIDERS[id](sym, timeoutMs);
      return formatQuote(quote);
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return `[Error] Could not fetch quote for ${sym.display}. ${errors.join(" | ")}`;
}

// ─── Tool definition ────────────────────────────────────────────────────────

export const stockQuoteTool: ToolDefinition = {
  name: "stock_quote",
  kind: "read",
  description:
    "Fetches the latest stock/ETF quote for a symbol. Supported formats: HK (6963.HK), " +
    "A-share (600519.SS / 000001.SZ), US (AAPL). Returns price, change, open/high/low, volume, " +
    "currency and market state. Tries Tencent/Yahoo/Stooq in order with automatic fallback; " +
    "pass provider to force a specific source.",
  permission: "safe",
  readOnly: true,
  isIdempotent: true,
  isConcurrencySafe: true,
  parameters: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Stock symbol, e.g. '6963.HK', '600519.SS', '000001.SZ', 'AAPL'",
      },
      provider: {
        type: "string",
        enum: ["auto", "yahoo", "tencent", "stooq"],
        description: "Optional provider override (default auto)",
      },
      timeoutMs: {
        type: "number",
        description: "Optional per-provider timeout in milliseconds (default 15000)",
      },
    },
    required: ["symbol"],
  },
  async execute(args) {
    const symbol = String(args.symbol ?? "").trim();
    const normalized = normalizeSymbol(symbol);
    if (typeof normalized === "string") return normalized;
    const provider = String(args.provider ?? "auto").trim();
    const timeoutMs = Number(args.timeoutMs ?? 15000);
    return await fetchQuote(normalized, provider, timeoutMs);
  },
};
