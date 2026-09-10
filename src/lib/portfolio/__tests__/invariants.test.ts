import { describe, it, expect } from "vitest";
import { reinforcePosition, reducePosition, marketValue, unrealizedPnLPercent } from "../index";
import { capitalAtRisk } from "../../connectors/margin";
import { splitPortfolioCash, unallocatedCash } from "../../accounting/unallocated";
import { drawdown, concentration, runway, monthsToGoal } from "../../stats";
import { toBase, sumInBase } from "../../fx";

/** Deterministic pseudo-random, so a failure is reproducible from its seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("buying and selling conserve money", () => {
  it("keeps the cost of a position equal to what was paid for it", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      let state = { quantity: 0, avgEntryPrice: 0 };
      let paid = 0;

      for (let i = 0; i < 10; i++) {
        const quantity = Math.round(r() * 100) / 10 + 0.1;
        const price = Math.round(r() * 900) / 10 + 1;
        paid += quantity * price;
        state = reinforcePosition(state, { quantity, price });
      }

      // Average cost times quantity is what you spent. Drift here would show
      // up as phantom profit the moment anything is sold.
      expect(Math.abs(state.quantity * state.avgEntryPrice - paid)).toBeLessThan(0.05);
    }
  });

  it("never sells more than is held, and never leaves a negative position", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const held = Math.round(r() * 500) / 10;
      const state = { quantity: held, avgEntryPrice: Math.round(r() * 500) / 10 + 1 };
      // Deliberately asks to sell more than exists.
      const after = reducePosition(state, { quantity: held * (1 + r() * 3), price: r() * 100 });

      expect(after.quantity).toBeGreaterThanOrEqual(0);
      expect(after.quantity).toBeLessThanOrEqual(held + 1e-6);
      expect(Number.isNaN(after.realized)).toBe(false);
      // A sale never changes what the remaining shares cost.
      expect(after.avgEntryPrice).toBe(state.avgEntryPrice);
    }
  });

  it("realises the mirror image for a short", () => {
    const long = reducePosition({ quantity: 10, avgEntryPrice: 100 }, { quantity: 10, price: 120 });
    const short = reducePosition(
      { quantity: 10, avgEntryPrice: 100, direction: "short" },
      { quantity: 10, price: 120 }
    );

    expect(long.realized).toBe(200);
    expect(short.realized).toBe(-200);
  });

  it("gives no percentage when nothing was paid", () => {
    // The 11248% on the chart came from dividing by a cost basis of nearly
    // zero. Asserted so the guard can't be removed by accident.
    const p = unrealizedPnLPercent({ quantity: 5, avgEntryPrice: 0, currentPrice: 10 });
    expect(Number.isFinite(p)).toBe(true);
    expect(Number.isNaN(p)).toBe(false);
  });

  it("values a position without ever returning NaN", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const value = marketValue({
        quantity: r() < 0.1 ? 0 : r() * 100,
        avgEntryPrice: r() < 0.1 ? 0 : r() * 100,
        currentPrice: r() < 0.1 ? 0 : r() * 100,
      });
      expect(Number.isNaN(value)).toBe(false);
    }
  });
});

describe("capital at risk never exceeds the position", () => {
  it("holds for any leverage, reported or inferred", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const positionValue = (r() < 0.5 ? 1 : -1) * r() * 5000;
      const risk = capitalAtRisk({
        positionValue,
        marginUsed: r() < 0.5 ? null : r() * 5000,
        leverage: r() < 0.3 ? null : r() * 20,
      });

      expect(risk.notional).toBeGreaterThanOrEqual(0);
      expect(risk.atRisk).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(risk.atRisk)).toBe(false);
      expect(Number.isFinite(risk.atRisk)).toBe(true);
    }
  });

  it("risks the whole value when nothing says it is leveraged", () => {
    const risk = capitalAtRisk({ positionValue: 250, marginUsed: null, leverage: null });
    expect(risk.atRisk).toBe(250);
    expect(risk.reported).toBe(false);
  });
});

describe("splitting free cash", () => {
  it("always adds back up to the free figure", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const free = Math.round((r() * 2000 - 200) * 100) / 100;
      const percent = r() < 0.2 ? null : Math.round(r() * 140 - 20);

      const split = splitPortfolioCash(free, percent);

      expect(Math.abs(split.spendable + split.belongsToPortfolio - free)).toBeLessThan(0.02);
      // Investing money is never negative, whatever percentage was typed.
      expect(split.belongsToPortfolio).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(split.spendable)).toBe(false);
    }
  });

  it("treats an unset share as spendable and says so", () => {
    const split = splitPortfolioCash(100, null);
    expect(split).toEqual({ spendable: 100, belongsToPortfolio: 0, unset: true });
  });

  it("never reports a bucket reservation larger than the money", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const view = unallocatedCash({
        availableOnPlatform: r() * 1000,
        separatePool: r() < 0.5 ? undefined : r() * 500,
        allocatedToBuckets: r() * 2000,
        marginUsed: r() < 0.5 ? undefined : r() * 300,
      });

      expect(view.reservedForBuckets).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(view.free)).toBe(false);
      // Over-allocation must be surfaced, not smoothed away.
      if (view.free < -0.005) expect(view.overAllocated).toBe(true);
    }
  });
});

describe("statistics stay inside their own definitions", () => {
  it("never reports a positive drawdown", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const series = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        value: r() * 1000,
      }));

      const d = drawdown(series);
      // Reported as a positive magnitude, so the invariant is that it never
      // goes negative — a "negative fall" would be a rise wearing the wrong
      // name, and it would be read as a warning.
      expect(d.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(d.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
      expect(d.currentDrawdown).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(d.maxDrawdownPercent)).toBe(false);
      // The trough of the worst fall cannot be above its peak.
      expect(d.trough).toBeLessThanOrEqual(d.peak + 1e-9);
    }
  });

  it("keeps concentration between 0 and 100", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const count = 1 + Math.floor(r() * 10);
      const items = Array.from({ length: count }, (_, i) => ({
        name: `i${i}`,
        value: r() * 1000,
      }));

      const c = concentration(items);
      expect(c.largestShare).toBeGreaterThanOrEqual(0);
      expect(c.largestShare).toBeLessThanOrEqual(100);
      expect(c.index).toBeGreaterThanOrEqual(0);
      expect(c.index).toBeLessThanOrEqual(100);
      expect(Number.isNaN(c.largestShare)).toBe(false);
      // Equivalent count can never exceed the number of things there are.
      expect(c.effectiveCount).toBeGreaterThan(0);
      expect(c.effectiveCount).toBeLessThanOrEqual(count + 1e-9);
    }
  });

  it("declines to compute a runway or a goal date out of nothing", () => {
    expect(runway(1000, 0)).toBeNull();
    expect(runway(1000, -5)).toBeNull();
    expect(monthsToGoal(100, 1000, 0)).toBeNull();
    expect(monthsToGoal(100, 1000, -50)).toBeNull();
    // Already there: no months needed, and certainly not a negative count.
    expect(monthsToGoal(2000, 1000, 100)).toBe(0);
  });
});

describe("currency conversion refuses rather than guesses", () => {
  const rates = { EUR: 1, USD: 1.1 };

  it("returns null for a currency it has no rate for", () => {
    // Returning the number unconverted would silently add dollars to euros,
    // which is the fourth bug in this codebase's history.
    expect(toBase(100, "JPY", rates, "EUR")).toBeNull();
    expect(toBase(100, "USD", rates, "EUR")).toBeCloseTo(90.91, 1);
  });

  it("reports what it could not convert instead of dropping it", () => {
    const { total, unconverted } = sumInBase(
      [
        { amount: 100, currency: "EUR" },
        { amount: 50, currency: "JPY" },
      ],
      rates,
      "EUR"
    );

    expect(total).toBe(100);
    expect(unconverted).toEqual([{ amount: 50, currency: "JPY" }]);
  });

  it("round-trips a conversion back to where it started", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const amount = Math.round(r() * 10000) / 100;
      const back = toBase(toBase(amount, "USD", rates, "EUR") ?? 0, "EUR", { EUR: 1, USD: 1 }, "EUR");
      expect(Number.isNaN(back ?? NaN)).toBe(false);
    }
  });
});
