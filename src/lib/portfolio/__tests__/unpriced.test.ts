import { describe, it, expect } from "vitest";
import { isUnpriced, unrealizedPnL } from "../index";

/**
 * "Nothing has moved" and "nothing has been measured" are different claims.
 *
 * A position adopted from a statement carries its purchase price in the
 * current-price field, because that is the only price the statement contains.
 * Reporting "+0.00" for it says the market hasn't moved — a measurement — when
 * in fact no measurement exists. Twelve rows of green +0.00 is a portfolio
 * claiming to be exactly flat, which nobody's portfolio has ever been.
 */
describe("telling an unpriced position from a flat one", () => {
  it("calls a position with no price update unpriced", () => {
    expect(
      isUnpriced({ avgEntryPrice: 10, currentPrice: 10, lastPriceUpdate: null })
    ).toBe(true);
  });

  it("calls one sitting exactly at cost unpriced, when nothing prices it", () => {
    // Covers positions adopted before the null was recorded: the price equals
    // the cost and no source was ever chosen.
    expect(
      isUnpriced({
        avgEntryPrice: 25.4,
        currentPrice: 25.4,
        quoteSymbol: null,
        lastPriceUpdate: new Date("2026-08-20"),
      })
    ).toBe(true);
  });

  it("trusts a position that has a price source, even at the same number", () => {
    // Choosing a symbol is a measurement. If it comes back equal to cost, the
    // market really is flat, and reporting zero is then correct.
    expect(
      isUnpriced({
        avgEntryPrice: 25.4,
        currentPrice: 25.4,
        quoteSymbol: "sxr8.de",
        lastPriceUpdate: new Date("2026-08-20"),
      })
    ).toBe(false);
  });

  it("leaves a genuinely moved position alone", () => {
    expect(
      isUnpriced({
        avgEntryPrice: 10,
        currentPrice: 11.5,
        lastPriceUpdate: new Date("2026-08-20"),
      })
    ).toBe(false);
  });

  it("agrees with the arithmetic it is guarding", () => {
    // The P&L of a position at cost really is zero. The point is not that the
    // number is wrong — it is that presenting it as a result implies someone
    // looked.
    const atCost = { quantity: 3, avgEntryPrice: 25.4, currentPrice: 25.4 };
    expect(unrealizedPnL(atCost)).toBe(0);
    expect(isUnpriced({ ...atCost, lastPriceUpdate: null })).toBe(true);
  });
});

import { crossCheckPricing } from "../reconstruct";

/**
 * Two independent measurements of one number.
 *
 * The account declares what it holds; the priced instruments add up to
 * something. A wrongly matched listing returns a real price for a real
 * instrument, so the row looks perfect and only the total gives it away.
 */
describe("checking prices against what the account says", () => {
  it("stays quiet when the two agree", () => {
    const check = crossCheckPricing({
      declaredValue: 450.83,
      pricedValue: 448.1,
      unpricedCost: 0,
      unpricedCount: 0,
    });

    expect(check?.suspicious).toBe(false);
    expect(check?.difference).toBeCloseTo(-2.73, 2);
  });

  it("flags the disagreement that means a wrong listing", () => {
    // The real case: prices summing to a 46 € loss against an account that
    // says it is up 26 €. Nothing on any single row looked wrong.
    const check = crossCheckPricing({
      declaredValue: 450.83,
      pricedValue: 378.02,
      unpricedCost: 0,
      unpricedCount: 0,
    });

    expect(check?.suspicious).toBe(true);
    expect(check?.percent).not.toBeNull();
  });

  it("counts the still-unpriced ones at cost and says how many", () => {
    const check = crossCheckPricing({
      declaredValue: 450,
      pricedValue: 300,
      unpricedCost: 140,
      unpricedCount: 3,
    });

    expect(check?.estimate).toBe(440);
    expect(check?.unpricedCount).toBe(3);
    expect(check?.suspicious).toBe(false);
  });

  it("tolerates ordinary movement on a small account", () => {
    // Ten euros or five percent, whichever is larger — a balance typed in last
    // week against prices fetched today will never match to the cent.
    expect(
      crossCheckPricing({ declaredValue: 100, pricedValue: 108, unpricedCost: 0, unpricedCount: 0 })
        ?.suspicious
    ).toBe(false);
  });

  it("says nothing when the account hasn't declared a value", () => {
    expect(
      crossCheckPricing({ declaredValue: null, pricedValue: 100, unpricedCost: 0, unpricedCount: 0 })
    ).toBeNull();
  });
});
