import { describe, it, expect } from "vitest";
import { computeNetWorth, purposeSplit } from "../networth";

/**
 * The four purposes must partition the net worth exactly.
 *
 * Written down here because the Analytics chart got this wrong in the most
 * expensive way: it added each account's free cash to the investments figure,
 * the same euros appeared in both, and it reported 880 € against a net worth of
 * 694 €. A chart that doesn't add up is worse than no chart — it looks like an
 * answer.
 */
const round2 = (n: number) => Math.round(n * 100) / 100;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const netWorthOf = (over: Partial<Parameters<typeof computeNetWorth>[0]> = {}) =>
  computeNetWorth({
    cash: 0,
    manualPortfolio: 0,
    syncedPortfolio: 0,
    openPositionValue: 0,
    floatingPortfolio: 0,
    ...over,
  });

describe("money by purpose", () => {
  it("adds up to the net worth, whatever the shape of the accounts", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed);
      const insideBalances = Array.from({ length: Math.floor(r() * 4) }, () => ({
        cash: Math.round(r() * 2000 * 100) / 100,
        invested: Math.round(r() * 3000 * 100) / 100,
      }));

      const manualPortfolio = Math.round(r() * 400 * 100) / 100;
      const syncedPortfolio = Math.round(r() * 400 * 100) / 100;

      const result = netWorthOf({
        cash: insideBalances.reduce((s, a) => s + a.cash, 0),
        manualPortfolio,
        syncedPortfolio,
        /**
         * A slice of the portfolio, never more than it.
         *
         * `getPortfolioContribution` splits the same holdings into stable and
         * floating, so the floating part cannot exceed the whole. Generating it
         * independently was testing a state the app cannot produce.
         */
        floatingPortfolio: round2((manualPortfolio + syncedPortfolio) * r()),
        insideBalances,
      });

      const split = purposeSplit({
        result,
        // Both deliberately allowed to be absurd: a percentage can be set on
        // more cash than exists, and buckets can be over-promised.
        investingCash: r() * 3000,
        promisedToBuckets: r() * 3000,
      });

      const sum = split.invested + split.waitingToInvest + split.promised + split.free;
      expect(Math.abs(sum - result.total)).toBeLessThan(0.03);

      for (const value of Object.values(split)) {
        expect(value).toBeGreaterThanOrEqual(-0.005);
        expect(Number.isNaN(value)).toBe(false);
      }
    }
  });

  it("counts stablecoins as waiting to invest, not as invested", () => {
    // The whole point of the fourth slice. A stablecoin is investment money
    // that hasn't been invested: its price doesn't move, so calling it
    // "invested" overstates risk, and calling it "free to spend" overstates
    // what you could live on.
    const result = netWorthOf({
      cash: 100,
      syncedPortfolio: 500, // a stablecoin pool
      floatingPortfolio: 0, // none of it can move
    });

    const split = purposeSplit({ result, investingCash: 0, promisedToBuckets: 0 });

    expect(split.invested).toBe(0);
    expect(split.waitingToInvest).toBe(500);
    expect(split.free).toBe(100);
  });

  it("moves earmarked idle cash out of free to spend", () => {
    const result = netWorthOf({ cash: 1000 });
    const split = purposeSplit({ result, investingCash: 300, promisedToBuckets: 0 });

    expect(split.waitingToInvest).toBe(300);
    expect(split.free).toBe(700);
  });

  it("takes bucket promises before investing money", () => {
    // A bucket is a decision you wrote down; the investing share is a
    // percentage. When there isn't enough cash for both, the explicit one wins.
    const result = netWorthOf({ cash: 100 });
    const split = purposeSplit({ result, investingCash: 80, promisedToBuckets: 60 });

    expect(split.promised).toBe(60);
    expect(split.waitingToInvest).toBe(40);
    expect(split.free).toBe(0);
  });

  it("caps what buckets have promised at the cash that exists", () => {
    const result = netWorthOf({ cash: 100 });
    const split = purposeSplit({ result, investingCash: 0, promisedToBuckets: 500 });

    expect(split.promised).toBe(100);
    expect(split.free).toBe(0);
  });

  it("puts everything under one purpose when there is only one", () => {
    const split = purposeSplit({
      result: netWorthOf({ cash: 250 }),
      investingCash: 0,
      promisedToBuckets: 0,
    });

    expect(split).toEqual({ invested: 0, waitingToInvest: 0, promised: 0, free: 250 });
  });

  it("survives an empty picture", () => {
    const split = purposeSplit({
      result: netWorthOf(),
      investingCash: 0,
      promisedToBuckets: 0,
    });

    expect(split).toEqual({ invested: 0, waitingToInvest: 0, promised: 0, free: 0 });
  });
});
