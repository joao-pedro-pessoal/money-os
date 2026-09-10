import { describe, it, expect } from "vitest";
import {
  parseSearchResults,
  parseSnapshot,
  parsePriceField,
  describeAvailability,
  obviousMatch,
} from "../quotes";

describe("finding an instrument by ISIN", () => {
  it("reads the listings the gateway returns", () => {
    const results = parseSearchResults([
      {
        conid: 12345,
        symbol: "IWDA",
        companyName: "ISHARES CORE MSCI WORLD",
        exchange: "AEB",
        currency: "EUR",
        secType: "STK",
      },
      { conid: "67890", symbol: "SWDA", exchange: "LSE", currency: "GBP" },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ conid: "12345", currency: "EUR", exchange: "AEB" });
    expect(results[1].currency).toBe("GBP");
  });

  it("drops a row with no contract id", () => {
    // Without one it can't be priced, so offering it would be offering a dead
    // end dressed as a choice.
    expect(parseSearchResults([{ symbol: "X", currency: "EUR" }])).toEqual([]);
  });

  it("survives a shape it doesn't recognise", () => {
    expect(parseSearchResults(null)).toEqual([]);
    expect(parseSearchResults({ error: "no" })).toEqual([]);
    expect(parseSearchResults({ results: [{ conid: "1" }] })).toHaveLength(1);
  });
});

describe("the price field", () => {
  it("keeps a previous close from passing as a live price", () => {
    // IBKR marks a close with "C" and a halt with "H". Stripping the letter and
    // keeping the number turns yesterday into today — three different claims
    // wearing the same figure.
    expect(parsePriceField("C123.45")).toEqual({ value: 123.45, isClose: true });
    expect(parsePriceField("H99.5")).toEqual({ value: 99.5, isClose: true });
    expect(parsePriceField("123.45")).toEqual({ value: 123.45, isClose: false });
    expect(parsePriceField(123.45)).toEqual({ value: 123.45, isClose: false });
  });

  it("returns nothing rather than a guess", () => {
    expect(parsePriceField("")).toEqual({ value: null, isClose: false });
    expect(parsePriceField(null)).toEqual({ value: null, isClose: false });
    expect(parsePriceField("n/a")).toEqual({ value: null, isClose: false });
    expect(parsePriceField(Number.NaN)).toEqual({ value: null, isClose: false });
  });

  it("reads a thousands separator", () => {
    expect(parsePriceField("1,234.56").value).toBe(1234.56);
  });
});

describe("a snapshot", () => {
  it("pairs the price with what kind of data it is", () => {
    const [quote] = parseSnapshot([{ conid: "12345", "31": "C512.30", "6509": "DPB" }]);

    expect(quote.price).toBe(512.3);
    expect(quote.isClose).toBe(true);
    expect(describeAvailability(quote.availability)).toMatch(/delayed/i);
  });

  it("reports no price without inventing one", () => {
    // "No subscription" and "no price" look identical from outside and lead to
    // completely different next steps, so the code is carried through.
    const [quote] = parseSnapshot([{ conid: "1", "6509": "N" }]);

    expect(quote.price).toBeNull();
    expect(describeAvailability(quote.availability)).toMatch(/subscription/i);
  });

  it("says nothing about a code it doesn't know", () => {
    expect(describeAvailability("Q")).toBeNull();
    expect(describeAvailability(null)).toBeNull();
  });
});

describe("choosing a listing", () => {
  const candidates = [
    { conid: "1", symbol: "IWDA", name: null, exchange: "AEB", currency: "EUR", secType: "STK" },
    { conid: "2", symbol: "SWDA", name: null, exchange: "LSE", currency: "GBP", secType: "STK" },
    { conid: "3", symbol: "IWDA", name: null, exchange: "SWX", currency: "CHF", secType: "STK" },
  ];

  it("takes the one that matches the currency you paid in", () => {
    expect(obviousMatch(candidates, "EUR")?.conid).toBe("1");
    expect(obviousMatch(candidates, "gbp")?.conid).toBe("2");
  });

  it("refuses to choose when two listings share the currency", () => {
    // Two euro listings on different exchanges have different prices. Picking
    // one would be picking a number, which is a decision with money attached.
    const ambiguous = [
      { ...candidates[0], conid: "1" },
      { ...candidates[0], conid: "4", exchange: "GETTEX" },
    ];
    expect(obviousMatch(ambiguous, "EUR")).toBeNull();
  });

  it("refuses when nothing matches at all", () => {
    // A euro position priced off the London listing is wrong by the exchange
    // rate and looks entirely sensible, which is the worst combination.
    expect(obviousMatch(candidates, "USD")).toBeNull();
    expect(obviousMatch([], "EUR")).toBeNull();
  });
});
