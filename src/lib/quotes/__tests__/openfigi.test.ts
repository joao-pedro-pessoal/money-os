import { describe, it, expect } from "vitest";
import { parseFigiMapping, candidateSymbols, figiRequestBody } from "../openfigi";

describe("asking OpenFIGI", () => {
  it("sends one entry per ISIN", () => {
    expect(JSON.parse(figiRequestBody(["IE00B5BMR087", "LU1681048804"]))).toEqual([
      { idType: "ID_ISIN", idValue: "IE00B5BMR087" },
      { idType: "ID_ISIN", idValue: "LU1681048804" },
    ]);
  });
});

describe("reading the answer", () => {
  it("takes the ticker and the exchange from each listing", () => {
    const [listings] = parseFigiMapping([
      {
        data: [
          { ticker: "SXR8", exchCode: "GY", name: "ISHARES CORE S&P 500", securityType: "ETP" },
          { ticker: "CSPX", exchCode: "LN", name: "ISHARES CORE S&P 500" },
        ],
      },
    ]);

    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({ ticker: "SXR8", exchCode: "GY" });
  });

  it("treats a not-found warning as no listings, not as an error", () => {
    // OpenFIGI answers `{ warning: "No identifier found." }` with a 200, so an
    // unrecognised ISIN has to be recognised rather than thrown.
    expect(parseFigiMapping([{ warning: "No identifier found." }])).toEqual([[]]);
  });

  it("drops a listing with no ticker", () => {
    // A listing you can't name is a listing you can't price.
    const [listings] = parseFigiMapping([{ data: [{ exchCode: "GY", name: "Something" }] }]);
    expect(listings).toEqual([]);
  });

  it("survives a shape it has never seen", () => {
    expect(parseFigiMapping(null)).toEqual([]);
    expect(parseFigiMapping({ error: true })).toEqual([]);
  });
});

describe("turning listings into symbols to try", () => {
  const listings = [
    { ticker: "CSPX", exchCode: "LN", name: null, securityType: null },
    { ticker: "SXR8", exchCode: "GY", name: null, securityType: null },
    { ticker: "SXR8", exchCode: "GR", name: null, securityType: null },
    { ticker: "IVV", exchCode: "UN", name: null, securityType: null },
  ];

  it("puts the currency you paid in first", () => {
    // Trying London first would find a real price that is wrong by the
    // exchange rate — and look right, which is worse than finding nothing.
    const candidates = candidateSymbols(listings, "EUR");

    expect(candidates[0].currency).toBe("EUR");
    expect(candidates[0].symbol).toBe("sxr8.de");
  });

  it("asks the same market once, however many venues are listed", () => {
    // Xetra and Frankfurt are both ".de" and both "sxr8.de". Asking a free
    // service the same question twice is just rude.
    const candidates = candidateSymbols(listings, "EUR");
    expect(candidates.filter((c) => c.symbol === "sxr8.de")).toHaveLength(1);
  });

  it("ignores an exchange it has no mapping for", () => {
    // No candidate rather than a guessed one: a wrong market means a wrong
    // currency, which means a plausible price that is out by the rate.
    const candidates = candidateSymbols(
      [{ ticker: "XYZ", exchCode: "ZZ", name: null, securityType: null }],
      "EUR"
    );
    expect(candidates).toEqual([]);
  });

  it("still returns the others when nothing matches the currency", () => {
    // So a caller can report what exists rather than saying nothing at all.
    const candidates = candidateSymbols(listings, "CHF");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.currency !== "CHF")).toBe(true);
  });

  it("has nothing to offer for nothing", () => {
    expect(candidateSymbols([], "EUR")).toEqual([]);
  });
});
