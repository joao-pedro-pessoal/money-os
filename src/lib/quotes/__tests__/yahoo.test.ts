import { describe, it, expect } from "vitest";
import {
  parseYahooChart,
  yahooUrl,
  yahooSymbol,
  yahooHistoryUrl,
  parseYahooHistory,
} from "../yahoo";

const chart = (meta: Record<string, unknown>) => ({ chart: { result: [{ meta }] } });

describe("reading a Yahoo chart response", () => {
  it("takes the market price when there is one", () => {
    const quote = parseYahooChart(
      chart({
        symbol: "SXR8.DE",
        regularMarketPrice: 512.3,
        currency: "EUR",
        regularMarketTime: 1787238000,
      })
    );

    expect(quote?.price).toBe(512.3);
    expect(quote?.currency).toBe("EUR");
    expect(quote?.symbol).toBe("SXR8.DE");
  });

  it("falls back to the previous close before giving up", () => {
    // A market that hasn't opened today still has a real price from yesterday,
    // and a real price beats no price for a portfolio.
    expect(parseYahooChart(chart({ previousClose: 99.5, currency: "EUR" }))?.price).toBe(99.5);
    expect(parseYahooChart(chart({ chartPreviousClose: 88.25 }))?.price).toBe(88.25);
  });

  it("returns nothing rather than a zero", () => {
    // A price of zero would quietly delete the position from the portfolio.
    expect(parseYahooChart(chart({ regularMarketPrice: 0 }))).toBeNull();
    expect(parseYahooChart(chart({ currency: "EUR" }))).toBeNull();
  });

  it("survives an error payload", () => {
    // An unknown symbol comes back as an error object with a 404 status.
    expect(parseYahooChart({ chart: { result: null, error: { code: "Not Found" } } })).toBeNull();
    expect(parseYahooChart(null)).toBeNull();
    expect(parseYahooChart({})).toBeNull();
  });

  it("dates the price by the market's clock, not ours", () => {
    const quote = parseYahooChart(
      chart({ regularMarketPrice: 10, regularMarketTime: 1755600000 })
    );
    expect(quote?.date).toBe("2025-08-19");
  });
});

describe("Yahoo symbols", () => {
  it("uses Yahoo's own suffix per exchange", () => {
    // Different letters from Stooq's for the same venues — which is exactly why
    // a stored symbol has to remember which service it was written for.
    expect(yahooSymbol("SXR8", "GY")).toBe("SXR8.DE");
    expect(yahooSymbol("CSPX", "LN")).toBe("CSPX.L");
    expect(yahooSymbol("IVV", "UN")).toBe("IVV");
  });

  it("refuses an exchange it has no suffix for", () => {
    expect(yahooSymbol("XYZ", "ZZ")).toBeNull();
  });

  it("asks for a single day of daily candles", () => {
    const url = yahooUrl("sxr8.de");
    expect(url).toContain("SXR8.DE");
    expect(url).toContain("interval=1d");
  });
});

/**
 * The daily series behind the benchmark comparison.
 *
 * Same endpoint as the single quote, asked for a range. The payload is two
 * parallel arrays, which in this codebase is normally the shape of a bug — see
 * the Hyperliquid section of CLAUDE.md — so the guard is that their lengths
 * must agree, since neither carries an identifier to join on.
 */
const history = (
  timestamp: unknown,
  close: unknown,
  meta: Record<string, unknown> = { symbol: "SXR8.DE", currency: "EUR" }
) => ({ chart: { result: [{ meta, timestamp, indicators: { quote: [{ close }] } }] } });

/** 2026-01-01, 2026-01-02, 2026-01-05 in seconds. */
const T1 = Math.floor(Date.UTC(2026, 0, 1) / 1000);
const T2 = Math.floor(Date.UTC(2026, 0, 2) / 1000);
const T3 = Math.floor(Date.UTC(2026, 0, 5) / 1000);

describe("reading a Yahoo daily series", () => {
  it("asks the same endpoint for a range", () => {
    expect(yahooHistoryUrl("SXR8.DE", "1y")).toContain("range=1y");
    expect(yahooHistoryUrl("SXR8.DE", "1y")).toContain("SXR8.DE");
  });

  it("pairs each close with its own day", () => {
    const s = parseYahooHistory(history([T1, T2, T3], [400, 405, 410]))!;
    expect(s.points).toEqual([
      { date: "2026-01-01", close: 400 },
      { date: "2026-01-02", close: 405 },
      { date: "2026-01-05", close: 410 },
    ]);
    expect(s.currency).toBe("EUR");
  });

  /**
   * A holiday comes back as a null close, and it is not a price of zero. A
   * benchmark that touches zero for one day reports −100% and then a recovery
   * of several thousand percent — and both look like real market events.
   */
  it("drops a null close instead of reading it as zero", () => {
    const s = parseYahooHistory(history([T1, T2, T3], [400, null, 410]))!;
    expect(s.points.map((p) => p.close)).toEqual([400, 410]);
  });

  it("drops a zero close for the same reason", () => {
    const s = parseYahooHistory(history([T1, T2, T3], [400, 0, 410]))!;
    expect(s.points.map((p) => p.close)).toEqual([400, 410]);
  });

  /**
   * The guard that the Hyperliquid bug earned. Two arrays with no identifier
   * can only be paired by position, and position is only meaningful if they
   * are the same length. Off by one is a series drifting by a day, which looks
   * like a plausible market everywhere.
   */
  it("refuses when the two arrays disagree in length", () => {
    expect(parseYahooHistory(history([T1, T2, T3], [400, 405]))).toBeNull();
    expect(parseYahooHistory(history([T1, T2], [400, 405, 410]))).toBeNull();
  });

  it("returns the points oldest first, whatever order they arrived in", () => {
    const s = parseYahooHistory(history([T3, T1, T2], [410, 400, 405]))!;
    expect(s.points.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-05"]);
  });

  it("has nothing to say about an empty or malformed payload", () => {
    expect(parseYahooHistory(history([], []))).toBeNull();
    expect(parseYahooHistory({ chart: { result: [] } })).toBeNull();
    expect(parseYahooHistory({})).toBeNull();
    expect(parseYahooHistory(null)).toBeNull();
  });

  it("returns null when every close was unusable, rather than an empty series", () => {
    expect(parseYahooHistory(history([T1, T2], [null, null]))).toBeNull();
  });

  it("reports a missing currency as null rather than guessing one", () => {
    const s = parseYahooHistory(history([T1, T2], [400, 410], { symbol: "X" }))!;
    expect(s.currency).toBeNull();
  });
});
