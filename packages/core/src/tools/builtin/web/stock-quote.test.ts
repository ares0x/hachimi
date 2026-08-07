import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSymbol, quoteMarketState, stockQuoteTool } from "./stock-quote.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const YAHOO_JSON = JSON.stringify({
  chart: {
    result: [
      {
        meta: {
          currency: "USD",
          symbol: "AAPL",
          exchangeName: "NMS",
          fullExchangeName: "NasdaqGS",
          marketState: "REGULAR",
          regularMarketPrice: 220.5,
          regularMarketTime: 1750000000,
          chartPreviousClose: 219.0,
          previousClose: 219.0,
        },
        indicators: {
          quote: [
            { open: [218.0], high: [221.0], low: [217.5], close: [220.5], volume: [50000000] },
          ],
        },
      },
    ],
  },
});

// 阳光保险 in GBK (D1F4 B9E2 B1A3 CFD5) — Buffer has no gbk encoder, so build bytes via latin1.
const GBK_SUNSHINE = Buffer.from([0xd1, 0xf4, 0xb9, 0xe2, 0xb1, 0xa3, 0xcf, 0xd5]).toString(
  "latin1"
);

function tencentBody(price = "3.605"): Uint8Array {
  // Fields follow qt.gtimg.cn v_hkXXXXXX layout (see TENCENT_FIELD mapping).
  const fields = Array.from({ length: 80 }, () => "0");
  fields[1] = GBK_SUNSHINE;
  fields[2] = "06963";
  fields[3] = price;
  fields[4] = "3.660";
  fields[5] = "3.615";
  fields[6] = "5581235.0";
  fields[30] = "2026/01/05 16:08:38"; // a past trading day → market closed
  fields[31] = "-0.055";
  fields[32] = "-1.50";
  fields[33] = "3.640";
  fields[34] = "3.560";
  fields[35] = price;
  fields[36] = "5581235.0";
  fields[37] = "20056101.800";
  fields[39] = "5.94";
  fields[44] = "414.6299";
  fields[47] = "4.321";
  fields[48] = "3.120";
  fields[77] = "HKD";
  return Buffer.from(`v_hk06963="${fields.join("~")}"`, "latin1");
}

describe("normalizeSymbol", () => {
  it("parses HK codes", () => {
    const s = normalizeSymbol("6963.HK");
    expect(typeof s).not.toBe("string");
    if (typeof s === "string") return;
    expect(s.display).toBe("6963.HK");
    expect(s.yahoo).toBe("6963.HK");
    expect(s.tencent).toBe("hk06963");
    expect(s.stooq).toBe("6963.hk");
  });

  it("pads short HK codes", () => {
    const s = normalizeSymbol("700");
    if (typeof s === "string") throw new Error("expected symbol");
    expect(s.display).toBe("0700.HK");
    expect(s.yahoo).toBe("0700.HK");
    expect(s.tencent).toBe("hk00700");
  });

  it("parses A-share codes with suffixes", () => {
    const sh = normalizeSymbol("600519.SS");
    if (typeof sh === "string") throw new Error("expected symbol");
    expect(sh.tencent).toBe("sh600519");
    expect(sh.yahoo).toBe("600519.SS");

    const sz = normalizeSymbol("000001.SZ");
    if (typeof sz === "string") throw new Error("expected symbol");
    expect(sz.tencent).toBe("sz000001");
  });

  it("infers A-share market from a bare 6-digit code", () => {
    const sh = normalizeSymbol("600519");
    if (typeof sh === "string") throw new Error("expected symbol");
    expect(sh.market).toBe("SH");
    const sz = normalizeSymbol("300750");
    if (typeof sz === "string") throw new Error("expected symbol");
    expect(sz.market).toBe("SZ");
  });

  it("parses US tickers", () => {
    const s = normalizeSymbol("aapl");
    if (typeof s === "string") throw new Error("expected symbol");
    expect(s.market).toBe("US");
    expect(s.yahoo).toBe("AAPL");
    expect(s.stooq).toBe("aapl.us");
  });

  it("rejects unknown formats", () => {
    expect(normalizeSymbol("")).toContain("[Error]");
    expect(normalizeSymbol("???")).toContain("[Error]");
  });
});

describe("quoteMarketState", () => {
  const now = "2026-08-07T01:00:00.000Z"; // 09:00 Asia/Shanghai — before open
  it("marks a same-day in-session quote as open", () => {
    // 14:00 Asia/Shanghai on 2026-08-07 = 06:00Z
    expect(quoteMarketState("2026-08-07T06:00:00.000Z", "HK", now)).toBe("open");
  });
  it("marks a previous-day quote as closed", () => {
    expect(quoteMarketState("2026-08-06T08:08:38.000Z", "HK", now)).toBe("closed");
  });
  it("marks a same-day after-hours quote as closed", () => {
    // 16:08 Asia/Shanghai on 2026-08-07 = 08:08Z
    expect(quoteMarketState("2026-08-07T08:08:38.000Z", "HK", now)).toBe("closed");
  });
});

describe("stock_quote tool", () => {
  it("returns an error for an empty symbol", async () => {
    const res = await stockQuoteTool.execute({ symbol: " " });
    expect(res).toContain("[Error]");
  });

  it("queries Yahoo for a US ticker and formats the quote", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(YAHOO_JSON, { status: 200, headers: { "content-type": "application/json" } })
        )
    );
    const res = await stockQuoteTool.execute({ symbol: "AAPL" });
    expect(res).toContain("[Stock Quote] AAPL · NasdaqGS");
    expect(res).toContain("Price: USD 220.50");
    expect(res).toContain("Change: 1.50 (0.68%)");
    expect(res).toContain("High: 221.00");
    expect(res).toContain("Volume: 50,000,000");
    expect(res).toContain("Market: open");
    expect(res).toContain("Source: Yahoo Finance");
  });

  it("decodes GBK Tencent responses and parses HK fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(tencentBody(), {
          status: 200,
          headers: { "content-type": "text/html; charset=GBK" },
        })
      )
    );
    const res = await stockQuoteTool.execute({ symbol: "6963.HK" });
    expect(res).toContain("[Stock Quote] 6963.HK · 阳光保险");
    expect(res).toContain("Price: HKD 3.60");
    expect(res).toContain("Change: -0.055 (-1.50%)");
    expect(res).toContain("High: 3.64 | Low: 3.56");
    expect(res).toContain("Volume: 5,581,235");
    expect(res).toContain("Market: closed");
    expect(res).toContain("PE 5.94");
    expect(res).toContain("Market Cap 414.63亿 HKD");
    expect(res).toContain("Source: Tencent Quotes");
  });

  it("falls back from a failing provider to the next one", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Yahoo HTTP 429"))
      .mockResolvedValueOnce(
        new Response(
          "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-08-06,20:00:00,218.0,221.0,217.5,220.5,50000000",
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const res = await stockQuoteTool.execute({ symbol: "AAPL", provider: "yahoo" });
    expect(res).toContain("[Stock Quote] AAPL");
    expect(res).toContain("Source: Stooq CSV");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports per-provider errors when every source fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const res = await stockQuoteTool.execute({ symbol: "AAPL" });
    expect(res).toContain("[Error] Could not fetch quote for AAPL");
    expect(res).toContain("yahoo:");
    expect(res).toContain("stooq:");
    expect(res).toContain("tencent:");
  });
});

it("normalizes A-share units (lots → shares, 万元 → CNY)", async () => {
  const fields = Array.from({ length: 80 }, () => "0");
  fields[1] = GBK_SUNSHINE;
  fields[2] = "688825";
  fields[3] = "51.96";
  fields[4] = "54.30";
  fields[5] = "52.96";
  fields[6] = "5605748.59"; // 手 (×100 = shares)
  fields[30] = "2026/08/06 15:00:00";
  fields[31] = "-2.34";
  fields[32] = "-4.31";
  fields[33] = "53.23";
  fields[34] = "51.13";
  fields[37] = "2915190"; // 万元 (×10000 = CNY)
  fields[39] = "123.25";
  fields[44] = "2339.78";
  fields[47] = "65.16";
  fields[48] = "43.44";
  fields[71] = "4503230000"; // total shares
  fields[77] = "CNY";
  const body = Buffer.from(`v_sh688825="${fields.join("~")}"`, "latin1");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(body, { status: 200, headers: { "content-type": "text/html; charset=GBK" } })
      )
  );
  const res = await stockQuoteTool.execute({ symbol: "688825.SS" });
  expect(res).toContain("Volume: 560,574,859");
  expect(res).toContain("Turnover: CNY 29,151,900,000");
  expect(res).toContain("Total Shares 4,503,230,000 (45.03亿)");
  expect(res).toContain("Market Cap 2339.78亿 CNY");
});
