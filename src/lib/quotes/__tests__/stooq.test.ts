import { describe, it, expect } from "vitest";
import {
  parseStooqCsv,
  stooqUrl,
  suggestSymbols,
  currencyOfSymbol,
  STOOQ_MARKETS,
} from "../stooq";

const CSV = [
  "Symbol,Date,Time,Open,High,Low,Close,Volume",
  "SXR8.DE,2026-08-19,17:35:00,512.10,514.80,511.02,513.44,18422",
].join("\n");

describe("reading a Stooq answer", () => {
  it("takes the close and the day it belongs to", () => {
    expect(parseStooqCsv(CSV)).toEqual({
      symbol: "SXR8.DE",
      date: "2026-08-19",
      close: 513.44,
    });
  });

  it("treats an unknown symbol as no price, never as zero", () => {
    // Stooq answers "N/D" rather than an error, so "not found" and "worth
    // nothing" arrive looking identical. A price of zero would quietly delete
    // the position from the portfolio.
    const notFound = [
      "Symbol,Date,Time,Open,High,Low,Close,Volume",
      "NOPE.DE,N/D,N/D,N/D,N/D,N/D,N/D,N/D",
    ].join("\n");

    expect(parseStooqCsv(notFound)).toBeNull();
  });

  it("refuses a close that isn't a usable number", () => {
    const broken = ["Symbol,Date,Time,Close", "X.DE,2026-08-19,17:00,0"].join("\n");
    expect(parseStooqCsv(broken)).toBeNull();

    const nonsense = ["Symbol,Date,Time,Close", "X.DE,2026-08-19,17:00,abc"].join("\n");
    expect(parseStooqCsv(nonsense)).toBeNull();
  });

  it("survives an empty or truncated response", () => {
    expect(parseStooqCsv("")).toBeNull();
    expect(parseStooqCsv("Symbol,Date,Close")).toBeNull();
  });

  it("finds the columns by name, not by position", () => {
    // A column order change would otherwise read the volume as the price.
    const reordered = ["Close,Symbol,Date", "77.5,ABC.DE,2026-08-19"].join("\n");
    expect(parseStooqCsv(reordered)?.close).toBe(77.5);
  });
});

describe("the request", () => {
  it("asks for a header row, which is what makes the answer parseable", () => {
    const url = stooqUrl("SXR8.DE");
    expect(url).toContain("s=sxr8.de");
    expect(url).toContain("&h");
    expect(url).toContain("e=csv");
  });
});

describe("markets and currencies", () => {
  it("knows what currency a suffix implies", () => {
    // The suffix is the whole point: the same ETF trades in Frankfurt in euros
    // and in London in pounds, and pricing one off the other is wrong by the
    // exchange rate while looking entirely sensible.
    expect(currencyOfSymbol("sxr8.de")).toBe("EUR");
    expect(currencyOfSymbol("IWDA.UK")).toBe("GBP");
    expect(currencyOfSymbol("spy.us")).toBe("USD");
  });

  it("admits when it doesn't recognise the market", () => {
    // A bare ticker is read by Stooq as Polish. Guessing EUR here would price a
    // position off an exchange nobody chose.
    expect(currencyOfSymbol("sxr8")).toBeNull();
    expect(currencyOfSymbol("")).toBeNull();
  });

  it("suggests one symbol per market", () => {
    const suggestions = suggestSymbols("SXR8");

    expect(suggestions).toHaveLength(STOOQ_MARKETS.length);
    expect(suggestions).toContain("sxr8.de");
    // An existing suffix is replaced rather than doubled.
    expect(suggestSymbols("sxr8.de")).toContain("sxr8.de");
    expect(suggestSymbols("sxr8.de").every((s) => s.split(".").length === 2)).toBe(true);
  });

  it("has nothing to suggest for nothing", () => {
    expect(suggestSymbols("  ")).toEqual([]);
  });
});
