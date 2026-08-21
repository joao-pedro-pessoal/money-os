import { describe, it, expect } from "vitest";
import { largestRemainder, normaliseShares, distributeByPercent } from "../distribute";
import { periodBounds, periodProgress, isPacingOver, envelopeState } from "../envelopes";
import { computeNetWorth } from "../networth";
import { accountBreakdown, type AccountShape } from "../balanceScope";
import { eligibleCash, freeCash } from "../index";

/**
 * Invariants, checked over generated inputs rather than chosen ones.
 *
 * Every bug in this file's history passed the hand-written examples first. A
 * comparator returned NaN only for two unranked rows; a period boundary
 * excluded today only when the anchor was the 31st. Both were found here.
 */

/** Deterministic pseudo-random, so any failure is reproducible from its seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("percentages always add up to exactly 100", () => {
  it("holds for any set of weights", () => {
    // Largest-remainder exists precisely so rounding can't lose or invent a
    // percentage point. If it can, an allocation screen silently misplaces
    // money.
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const count = 1 + Math.floor(r() * 8);
      const items = Array.from({ length: count }, (_, i) => ({
        id: `i${i}`,
        name: `n${i}`,
        raw: r() * 100,
      }));
      // Normalise the raws to 100 first, which is the contract.
      const total = items.reduce((s, i) => s + i.raw, 0);
      if (total === 0) continue;
      const scaled = items.map((i) => ({ ...i, raw: (i.raw / total) * 100 }));

      const shares = largestRemainder(scaled);
      const sum = shares.reduce((s, x) => s + x.percent, 0);

      expect(Math.abs(sum - 100)).toBeLessThan(0.005);
      for (const s of shares) expect(s.percent).toBeGreaterThanOrEqual(0);
    }
  });

  it("survives hand-edited percentages that don't add up", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const count = 1 + Math.floor(r() * 6);
      const shares = Array.from({ length: count }, (_, i) => ({
        id: `i${i}`,
        name: `n${i}`,
        // Deliberately absurd: negatives, zeros, and totals far from 100.
        percent: Math.round((r() * 300 - 50) * 100) / 100,
      }));

      const sum = normaliseShares(shares).reduce((s, x) => s + x.percent, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.005);
    }
  });

  it("never distributes more than it was given", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const r = rng(seed);
      const amount = Math.round(r() * 5000 * 100) / 100;
      const count = 1 + Math.floor(r() * 5);
      const buckets = Array.from({ length: count }, (_, i) => ({
        id: `b${i}`,
        name: `b${i}`,
        priority: i + 1,
        current: Math.round(r() * 500 * 100) / 100,
        target: r() < 0.3 ? null : Math.round(r() * 2000 * 100) / 100,
      }));
      const shares = normaliseShares(
        buckets.map((b) => ({ id: b.id, name: b.name, percent: 100 / buckets.length }))
      );

      const plan = distributeByPercent(amount, buckets, shares);
      const placed = plan.moves.reduce((s, m) => s + m.amount, 0);

      // Money may be left over when every goal is full; it may never be
      // conjured. Overshooting is the failure that would matter.
      expect(placed).toBeLessThanOrEqual(amount + 0.005);
      expect(Math.abs(plan.distributed + plan.leftOver - amount)).toBeLessThan(0.02);
      for (const m of plan.moves) expect(m.amount).toBeGreaterThan(0);

      // No goal may be pushed past its target by the plan.
      for (const m of plan.moves) {
        const bucket = buckets.find((b) => b.id === m.bucketId);
        if (bucket?.target != null) {
          expect(bucket.current + m.amount).toBeLessThanOrEqual(bucket.target + 0.02);
        }
      }
    }
  });
});

describe("budget periods always contain today", () => {
  const periods = ["weekly", "monthly", "quarterly", "yearly"] as const;

  it("holds for every anchor day and every period", () => {
    // The 31st is the interesting one: February has no 31st, and an earlier
    // version put 28 February inside a period that ended on 28 February.
    for (const period of periods) {
      for (let day = 1; day <= 31; day++) {
        for (let month = 0; month < 12; month++) {
          const anchor = new Date(2024, 0, day);
          const today = new Date(2026, month, 15);
          const bounds = periodBounds(period, anchor, today);

          expect(bounds.start.getTime()).toBeLessThanOrEqual(today.getTime());
          expect(bounds.end.getTime()).toBeGreaterThan(today.getTime());
        }
      }
    }
  });

  it("gives a progress between 0 and 1, always", () => {
    for (const period of periods) {
      for (let day = 1; day <= 28; day++) {
        const bounds = periodBounds(period, new Date(2024, 5, day), new Date(2026, 7, 19));
        const progress = periodProgress(bounds, new Date(2026, 7, 19));

        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(1);
        expect(Number.isNaN(progress)).toBe(false);
      }
    }
  });

  it("never calls pacing 'over' on an envelope with no limit", () => {
    // 0 / 0 is NaN and NaN comparisons are false, so this passes by accident
    // unless the guard is there on purpose. Asserted so it stays on purpose.
    const state = envelopeState(
      { id: "e", name: "e", period: "monthly", anchor: new Date(2026, 0, 1), limit: 0, rollover: false, categoryIds: [] },
      [],
      new Date(2026, 7, 15)
    );

    expect(isPacingOver(state, 0.5)).toBe(false);
    expect(Number.isNaN(state.percent)).toBe(false);
  });
});

describe("net worth never loses or invents a euro", () => {
  it("cash plus portfolio equals the total, for any split", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const accountCount = Math.floor(r() * 5);
      const insideBalances = Array.from({ length: accountCount }, () => ({
        cash: Math.round(r() * 2000 * 100) / 100,
        // Deliberately allowed to exceed the cash: leverage does that.
        invested: Math.round(r() * 4000 * 100) / 100,
      }));

      const result = computeNetWorth({
        cash: insideBalances.reduce((s, a) => s + a.cash, 0),
        manualPortfolio: Math.round(r() * 500 * 100) / 100,
        syncedPortfolio: Math.round(r() * 500 * 100) / 100,
        openPositionValue: 0,
        floatingPortfolio: Math.round(r() * 400 * 100) / 100,
        insideBalances,
      });

      expect(Math.abs(result.cash + result.portfolio - result.total)).toBeLessThan(0.02);
      expect(Math.abs(result.floating + result.guaranteed - result.total)).toBeLessThan(0.02);
      // Reclassifying moves money between buckets; it can never make one
      // negative, which would be reported somewhere as a debt that isn't real.
      expect(result.cash).toBeGreaterThanOrEqual(-0.005);
      expect(Number.isNaN(result.total)).toBe(false);
    }
  });
});

describe("an account's parts always add to the account", () => {
  it("holds for every balance meaning", () => {
    const meanings = ["cash_only", "includes_positions", "bank_and_broker"] as const;

    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const account: AccountShape = {
        id: "a",
        balance: Math.round(r() * 3000 * 100) / 100,
        meaning: meanings[Math.floor(r() * meanings.length)],
        holdingsValue: Math.round(r() * 3000 * 100) / 100,
        synced: r() < 0.5,
        investedValue: r() < 0.2 ? null : Math.round(r() * 4000 * 100) / 100,
      };

      const b = accountBreakdown(account);

      expect(Math.abs(b.cash + b.portfolioOnTop - b.total)).toBeLessThan(0.005);
      expect(b.cash).toBeGreaterThanOrEqual(-0.005);
      expect(Number.isNaN(b.total)).toBe(false);
    }
  });

  it("never reports more spendable cash than the account holds", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const balance = Math.round(r() * 2000 * 100) / 100;
      const account = {
        id: "a",
        balance,
        investedValue: r() < 0.3 ? null : Math.round(r() * 3000 * 100) / 100,
      };

      expect(eligibleCash(account)).toBeLessThanOrEqual(balance + 0.005);
      expect(eligibleCash(account)).toBeGreaterThanOrEqual(-0.005);
      // Allocations only ever reduce it further.
      expect(freeCash(account, [{ accountId: "a", amount: 50 }])).toBeLessThanOrEqual(
        eligibleCash(account) + 0.005
      );
    }
  });
});
