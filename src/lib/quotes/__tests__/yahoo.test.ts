import { describe, it, expect } from "vitest";
import { parseYahooChart, yahooUrl, yahooSymbol } from "../yahoo";

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
