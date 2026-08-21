import { describe, it, expect } from "vitest";
import { valueHoldings, describeCoverage, type Quote } from "../quotes";
import { isValidIsin, normaliseIsin } from "../isin";
import type { ReconstructedHolding } from "../reconstruct";

function holding(over: Partial<ReconstructedHolding> = {}): ReconstructedHolding {
  return {
    key: "IE00B4L5Y983",
    isin: "IE00B4L5Y983",
    symbol: "IWDA",
    quantity: 10,
    costBasis: 1000,
    averageCost: 100,
    realizedPnl: 0,
    incomeReceived: 0,
    feesPaid: 0,
    firstBought: new Date("2026-01-01"),
    lastTraded: new Date("2026-01-01"),
    events: 1,
    incomplete: false,
    reasons: [],
    ...over,
  };
}

function quote(over: Partial<Quote> = {}): Quote {
  return {
    key: "IE00B4L5Y983",
    price: 120,
    currency: "EUR",
    asOf: new Date("2026-08-17"),
    source: "test",
    ...over,
  };
}

describe("valuing what you hold", () => {
  it("is quantity times price, against what it cost", () => {
    const r = valueHoldings([holding()], [quote()], "EUR");

    expect(r.totalValue).toBe(1200);
    expect(r.totalUnrealizedPnl).toBe(200);
    expect(r.totalUnrealizedPercent).toBe(20);
    expect(r.partial).toBe(false);
    expect(r.coveragePercent).toBe(100);
  });

  it("records where each price came from", () => {
    // A total that mixes a live feed with a figure typed in by hand months ago
    // should be able to say which is which.
    const r = valueHoldings([holding()], [quote({ source: "manual" })], "EUR");
    expect(r.priced[0].priceSource).toBe("manual");
  });

  it("matches an ISIN however it was capitalised", () => {
    const r = valueHoldings([holding()], [quote({ key: "ie00b4l5y983" })], "EUR");
    expect(r.totalValue).toBe(1200);
  });
});

describe("holdings it cannot price", () => {
  it("leaves them out of the total instead of calling them worthless", () => {
    // The dangerous version of this bug reports a smaller portfolio with no
    // error anywhere — and a portfolio that quietly shrinks is one you act on.
    const holdings = [holding(), holding({ key: "US0378331005", symbol: "AAPL", costBasis: 500 })];
    const r = valueHoldings(holdings, [quote()], "EUR");

    expect(r.totalValue).toBe(1200);
    expect(r.partial).toBe(true);
    expect(r.unpriced).toHaveLength(1);
    expect(r.unpriced[0].unpricedReason).toMatch(/no price/i);
  });

  it("compares like with like when part of the portfolio is missing", () => {
    // Value of the priced half against the cost of the *whole* portfolio would
    // invent a loss out of the instruments that simply have no quote.
    const holdings = [holding(), holding({ key: "US0378331005", costBasis: 500 })];
    const r = valueHoldings(holdings, [quote()], "EUR");

    expect(r.totalCostOfPriced).toBe(1000);
    expect(r.totalCostBasis).toBe(1500);
    expect(r.totalUnrealizedPnl).toBe(200);
  });

  it("reports coverage so a partial total can say how partial", () => {
    const holdings = [holding(), holding({ key: "US0378331005", costBasis: 1000 })];
    const r = valueHoldings(holdings, [quote()], "EUR");

    expect(r.coveragePercent).toBe(50);
    expect(describeCoverage(r)).toMatch(/leaves out 1 holding/i);
  });

  it("has nothing to add when everything is priced", () => {
    expect(describeCoverage(valueHoldings([holding()], [quote()], "EUR"))).toBeNull();
  });

  it("refuses a price it can't parse rather than passing it through", () => {
    const r = valueHoldings([holding()], [quote({ price: Number.NaN })], "EUR");
    expect(r.partial).toBe(true);
    expect(r.unpriced[0].unpricedReason).toMatch(/usable number/i);
  });
});

describe("currencies", () => {
  it("converts when it can", () => {
    const r = valueHoldings(
      [holding()],
      [quote({ currency: "USD", price: 110 })],
      "EUR",
      (amount, from, to) => (from === "USD" && to === "EUR" ? amount * 0.9 : null)
    );

    expect(r.totalValue).toBe(990);
  });

  it("drops the holding rather than mixing currencies in one total", () => {
    // €144.84 once appeared on this dashboard as $144.84 — wrong by the whole
    // exchange rate and entirely plausible-looking. Better to show less.
    const r = valueHoldings([holding()], [quote({ currency: "USD" })], "EUR");

    expect(r.totalValue).toBe(0);
    expect(r.partial).toBe(true);
    expect(r.unpriced[0].unpricedReason).toMatch(/no rate to EUR/i);
  });
});

describe("percentages", () => {
  it("declines to divide by a cost basis of nothing", () => {
    // The chart once read 11248% for exactly this reason.
    const r = valueHoldings([holding({ costBasis: 0, quantity: 5 })], [quote()], "EUR");
    expect(r.priced[0].unrealizedPercent).toBeNull();
    expect(r.totalUnrealizedPercent).toBeNull();
  });
});

describe("the ISIN itself", () => {
  it("accepts real ones", () => {
    // Apple, iShares Core MSCI World, and a German bund — three different
    // country prefixes and check digits.
    expect(isValidIsin("US0378331005")).toBe(true);
    expect(isValidIsin("IE00B4L5Y983")).toBe(true);
    expect(isValidIsin("DE0005140008")).toBe(true);
  });

  it("rejects one with a wrong check digit", () => {
    // The whole reason to validate: a single mistyped character produces a key
    // that matches no quote and no dividend, and shows up only as a total
    // that's quietly too low.
    expect(isValidIsin("US0378331006")).toBe(false);
  });

  it("rejects things that merely look like one", () => {
    expect(isValidIsin("IWDA")).toBe(false);
    expect(isValidIsin("")).toBe(false);
    expect(isValidIsin(null)).toBe(false);
    expect(isValidIsin("US03783310055")).toBe(false); // too long
    expect(isValidIsin("1S0378331005")).toBe(false); // country code must be letters
  });

  it("normalises to upper case, or to nothing at all", () => {
    expect(normaliseIsin("  us0378331005 ")).toBe("US0378331005");
    expect(normaliseIsin("US0378331006")).toBeNull();
  });
});
