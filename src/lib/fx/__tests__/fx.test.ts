import { describe, it, expect, vi } from "vitest";
import { toBase, fromBase, sumInBase, parseRates, fetchRates, FX_URL, DEFAULT_BASE_CURRENCY } from "../index";

// Rates are quoted per 1 EUR, so 1 EUR = 1.10 USD.
const RATES = { EUR: 1, USD: 1.1, GBP: 0.85 };

describe("toBase", () => {
  it("leaves the base currency untouched", () => {
    expect(toBase(100, "EUR", RATES)).toBe(100);
  });

  it("converts USD into EUR by dividing by the rate", () => {
    // 110 USD / 1.10 = 100 EUR
    expect(toBase(110, "USD", RATES)).toBe(100);
  });

  it("returns null for an unknown currency rather than passing it through", () => {
    expect(toBase(100, "JPY", RATES)).toBeNull();
  });

  it("returns null for a nonsensical rate", () => {
    expect(toBase(100, "USD", { EUR: 1, USD: 0 })).toBeNull();
  });
});

describe("fromBase", () => {
  it("converts EUR out to USD by multiplying", () => {
    expect(fromBase(100, "USD", RATES)).toBe(110);
  });

  it("round-trips", () => {
    const usd = fromBase(250, "USD", RATES)!;
    expect(toBase(usd, "USD", RATES)).toBe(250);
  });
});

describe("sumInBase", () => {
  it("sums mixed currencies into EUR", () => {
    const { total, unconverted } = sumInBase(
      [
        { amount: 100, currency: "EUR" },
        { amount: 110, currency: "USD" }, // 100 EUR
      ],
      RATES
    );
    expect(total).toBe(200);
    expect(unconverted).toEqual([]);
  });

  it("reports what it could not convert instead of counting it at 1:1", () => {
    const { total, unconverted } = sumInBase(
      [
        { amount: 100, currency: "EUR" },
        { amount: 5000, currency: "JPY" },
      ],
      RATES
    );
    expect(total).toBe(100); // the 5000 JPY is NOT added as if it were euros
    expect(unconverted).toEqual([{ amount: 5000, currency: "JPY" }]);
  });

  it("handles an empty list", () => {
    expect(sumInBase([], RATES)).toEqual({ total: 0, unconverted: [] });
  });
});

describe("parseRates", () => {
  it("parses the API response and always includes the base at 1", () => {
    const rates = parseRates({ base: "EUR", date: "2026-08-07", rates: { USD: 1.09, GBP: 0.84 } });
    expect(rates[DEFAULT_BASE_CURRENCY]).toBe(1);
    expect(rates.USD).toBe(1.09);
  });

  it("ignores malformed entries", () => {
    const rates = parseRates({ rates: { USD: "abc", GBP: -1, CHF: 0.95 } });
    expect(rates.USD).toBeUndefined();
    expect(rates.GBP).toBeUndefined();
    expect(rates.CHF).toBe(0.95);
  });

  it("survives a garbage response", () => {
    expect(parseRates(null)).toEqual({ EUR: 1 });
  });
});

describe("fetchRates", () => {
  it("requests rates quoted from the base currency", async () => {
    const httpGet = vi.fn().mockResolvedValue({ rates: { USD: 1.2 } });
    const rates = await fetchRates(httpGet);
    expect(httpGet).toHaveBeenCalledWith(FX_URL);
    expect(FX_URL).toContain("from=EUR");
    expect(rates.USD).toBe(1.2);
  });

  it("propagates a failure so the caller can fall back to the stored rate", async () => {
    await expect(fetchRates(vi.fn().mockRejectedValue(new Error("offline")))).rejects.toThrow("offline");
  });
});

describe("non-EUR base currency", () => {
  // Rates are quoted against EUR: 1 EUR = 1.10 USD = 0.85 GBP.
  it("converts EUR into a USD base", () => {
    // 100 EUR -> 110 USD
    expect(toBase(100, "EUR", RATES, "USD")).toBe(110);
  });

  it("leaves the chosen base untouched", () => {
    expect(toBase(110, "USD", RATES, "USD")).toBe(110);
  });

  it("crosses two non-base currencies", () => {
    // 85 GBP -> 100 EUR -> 110 USD
    expect(toBase(85, "GBP", RATES, "USD")).toBe(110);
  });

  it("sums mixed currencies into a USD base", () => {
    const { total, unconverted } = sumInBase(
      [
        { amount: 100, currency: "EUR" }, // 110 USD
        { amount: 50, currency: "USD" },
        { amount: 85, currency: "GBP" }, // 110 USD
      ],
      RATES,
      "USD"
    );
    expect(total).toBe(270);
    expect(unconverted).toEqual([]);
  });

  it("returns null when the chosen base itself has no rate", () => {
    expect(toBase(100, "EUR", { EUR: 1 }, "JPY")).toBeNull();
  });

  it("round-trips through a non-EUR base", () => {
    const inUsd = toBase(85, "GBP", RATES, "USD")!;
    expect(fromBase(inUsd, "GBP", RATES, "USD")).toBe(85);
  });
});
