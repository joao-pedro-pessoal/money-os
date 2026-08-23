import { describe, it, expect } from "vitest";
import { collateralOverlap, marginView, pressureOf, describePressure } from "../margin";

describe("marginView", () => {
  it("trusts what the platform reports over anything derived", () => {
    // The venue knows about maintenance margin and pending orders; a
    // subtraction here would not.
    const v = marginView({ equity: 123.67, marginUsed: 60, withdrawable: 24.91 });
    expect(v.available).toBe(24.91);
    expect(v.reported).toBe(true);
  });

  it("falls back to equity minus margin, and says it did", () => {
    const v = marginView({ equity: 100, marginUsed: 30, withdrawable: null });
    expect(v.available).toBe(70);
    expect(v.reported).toBe(false);
  });

  it("never reports negative availability", () => {
    // An account underwater has nothing free; it does not have minus €40 free.
    expect(marginView({ equity: 100, marginUsed: 140, withdrawable: null }).available).toBe(0);
    expect(marginView({ equity: 100, marginUsed: 0, withdrawable: -5 }).available).toBe(0);
  });

  it("treats missing margin as none used", () => {
    const v = marginView({ equity: 100, marginUsed: null, withdrawable: null });
    expect(v.marginUsed).toBe(0);
    expect(v.available).toBe(100);
  });

  it("works out how much of the account is locked", () => {
    expect(marginView({ equity: 200, marginUsed: 50, withdrawable: null }).usedPercent).toBe(25);
  });

  it("does not divide by zero on an empty account", () => {
    expect(marginView({ equity: 0, marginUsed: 0, withdrawable: null }).usedPercent).toBeNull();
  });

  it("reproduces the account from the screenshot", () => {
    // 123.67 equity with two open shorts, of which only 24.91 is actually free.
    // Showing the equity as available would overstate it fivefold.
    const v = marginView({ equity: 123.67, marginUsed: 98.76, withdrawable: 24.91 });
    expect(v.available).toBeLessThan(v.equity);
    expect(v.usedPercent).toBeCloseTo(79.86, 1);
  });
});

describe("pressureOf", () => {
  it("is comfortable when little is locked", () => {
    expect(pressureOf(marginView({ equity: 100, marginUsed: 10, withdrawable: null }))).toBe(
      "comfortable"
    );
  });

  it("is tight past half", () => {
    expect(pressureOf(marginView({ equity: 100, marginUsed: 55, withdrawable: null }))).toBe("tight");
  });

  it("is stretched past four fifths", () => {
    expect(pressureOf(marginView({ equity: 100, marginUsed: 85, withdrawable: null }))).toBe(
      "stretched"
    );
  });

  it("says nothing about an empty account", () => {
    expect(pressureOf(marginView({ equity: 0, marginUsed: 0, withdrawable: null }))).toBe(
      "comfortable"
    );
  });
});

describe("describePressure", () => {
  it("stays silent when there's nothing to say", () => {
    expect(describePressure(marginView({ equity: 100, marginUsed: 5, withdrawable: null }))).toBe("");
  });

  it("warns without claiming to predict a liquidation", () => {
    // That depends on each position's maintenance margin and mark price, which
    // this doesn't know — promising it would be a lie with consequences.
    const text = describePressure(marginView({ equity: 100, marginUsed: 90, withdrawable: null }));
    expect(text).not.toContain("liquidat");
    expect(text.length).toBeGreaterThan(0);
  });
});

/**
 * The money behind an open trade on a unified account never leaves the spot
 * balance, so the portfolio counted it twice: once as the balance and again as
 * the position's capital at risk.
 */
describe("collateralOverlap", () => {
  const base = { balancesAreSeparatePool: false, marginUsed: 10.71, openPositions: 1 };

  it("is the margin, when the balances are what backs the positions", () => {
    expect(collateralOverlap(base)).toBeCloseTo(10.71, 2);
  });

  it("is nothing when the balances are a pool of their own", () => {
    // Trading 212 reports free cash beside its ETFs; nothing overlaps.
    expect(collateralOverlap({ ...base, balancesAreSeparatePool: true })).toBe(0);
  });

  it("is nothing with no position open", () => {
    // Then anything held is a resting order, not collateral, and subtracting
    // it would understate the portfolio.
    expect(collateralOverlap({ ...base, openPositions: 0 })).toBe(0);
  });

  it("does not guess when the margin is unknown", () => {
    // Leaving the overlap in is visible and wrong; inventing a subtraction is
    // invisible and wrong.
    expect(collateralOverlap({ ...base, marginUsed: null })).toBe(0);
    expect(collateralOverlap({ ...base, marginUsed: NaN })).toBe(0);
  });

  it("never returns a negative, which would inflate the portfolio", () => {
    expect(collateralOverlap({ ...base, marginUsed: -5 })).toBe(0);
  });
});
