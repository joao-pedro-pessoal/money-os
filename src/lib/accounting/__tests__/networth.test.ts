import { describe, it, expect } from "vitest";
import { computeNetWorth as computeNetWorthSplit } from "../networth";

/**
 * A balance that is partly invested.
 *
 * Trade Republic arrives as one balance containing both spendable money and
 * ETFs. The balance is right; the classification isn't, until it is told where
 * the line falls.
 */
/**
 * Reclassification is capped per account, never across the total.
 *
 * The symptom was a dashboard reading "cash 0,00 €" beside a Free Cash card
 * reading "2,46 €". Both were computed correctly; the first was capping a
 * leveraged account's notional against everybody's money.
 */
describe("investments inside balances, account by account", () => {
  const base = {
    cash: 0,
    manualPortfolio: 0,
    syncedPortfolio: 0,
    openPositionValue: 0,
    floatingPortfolio: 0,
  };

  it("does not let one account's leverage swallow another's free cash", () => {
    // Hyperliquid: 88 of equity backing 400 of notional. Trade Republic: 451
    // of which 450 is ETFs. A savings account with 100 untouched.
    const r = computeNetWorth({
      ...base,
      cash: 639,
      insideBalances: [
        { cash: 88, invested: 400 },
        { cash: 451, invested: 450 },
        { cash: 100, invested: 0 },
      ],
    });

    // The savings account keeps its 100; Trade Republic keeps its 1 of change.
    expect(r.cash).toBe(101);
    expect(r.portfolio).toBe(538);
    expect(r.total).toBe(639);
  });

  it("would have reported no cash at all under the old total-wide cap", () => {
    // The same numbers without the per-account breakdown: 850 of investments
    // against 639 of cash clamps to 639, and every euro becomes invested.
    const r = computeNetWorth({ ...base, cash: 639, openPositionValue: 850 });

    expect(r.cash).toBe(0);
  });

  it("caps each account at its own balance", () => {
    const r = computeNetWorth({
      ...base,
      cash: 100,
      insideBalances: [{ cash: 100, invested: 10_000 }],
    });

    expect(r.cash).toBe(0);
    expect(r.portfolio).toBe(100);
    expect(r.total).toBe(100);
  });

  it("keeps the total untouched whatever the split", () => {
    for (const invested of [0, 50, 88, 500]) {
      const r = computeNetWorth({
        ...base,
        cash: 188,
        insideBalances: [
          { cash: 88, invested },
          { cash: 100, invested: 0 },
        ],
      });
      expect(r.cash + r.portfolio).toBeCloseTo(188, 8);
      expect(r.total).toBe(188);
    }
  });

  it("ignores a negative figure rather than adding cash out of it", () => {
    const r = computeNetWorth({
      ...base,
      cash: 100,
      insideBalances: [{ cash: 100, invested: -50 }],
    });

    expect(r.cash).toBe(100);
    expect(r.portfolio).toBe(0);
  });

  it("falls back to the total-wide cap when no breakdown is given", () => {
    // Still correct when there is one account, which is the only case where
    // the two rules agree.
    const r = computeNetWorth({ ...base, cash: 100, openPositionValue: 60 });

    expect(r.cash).toBe(40);
    expect(r.portfolio).toBe(60);
  });

  it("moves the reclassified money out of guaranteed too", () => {
    const r = computeNetWorth({
      ...base,
      cash: 188,
      insideBalances: [
        { cash: 88, invested: 400 },
        { cash: 100, invested: 0 },
      ],
    });

    // The 88 is at risk; the 100 sitting in cash is not.
    expect(r.floating).toBe(88);
    expect(r.guaranteed).toBe(100);
  });
});

describe("an account that is a bank and a broker", () => {
  const base = {
    cash: 1000,
    manualPortfolio: 0,
    syncedPortfolio: 0,
    openPositionValue: 0,
    floatingPortfolio: 0,
  };

  it("moves the invested half out of cash without touching the total", () => {
    const r = computeNetWorthSplit({ ...base, declaredInvested: 800 });

    expect(r.total).toBe(1000);
    expect(r.cash).toBe(200);
    expect(r.portfolio).toBe(800);
  });

  it("stops calling the invested half capital-guaranteed", () => {
    // The failure this prevents: a Trade Republic account of ETFs reported as
    // entirely safe, because it arrived through the door marked "balance".
    const r = computeNetWorthSplit({ ...base, declaredInvested: 800 });

    expect(r.floating).toBe(800);
    expect(r.guaranteed).toBe(200);
    expect(r.floating + r.guaranteed).toBe(r.total);
  });

  it("adds up with open positions from a connector at the same time", () => {
    // Both are money already inside a balance. Neither may be added again, and
    // together they still cannot exceed the cash that contains them.
    const r = computeNetWorthSplit({
      ...base,
      cash: 1000,
      openPositionValue: 300,
      declaredInvested: 500,
    });

    expect(r.total).toBe(1000);
    expect(r.cash).toBe(200);
    expect(r.portfolio).toBe(800);
  });

  it("cannot reclassify more than the cash it came from", () => {
    const r = computeNetWorthSplit({ ...base, cash: 500, declaredInvested: 900 });

    expect(r.cash).toBe(0);
    expect(r.total).toBe(500);
    expect(r.guaranteed).toBe(0);
  });

  it("behaves exactly as before when nothing declares a split", () => {
    const withField = computeNetWorthSplit({ ...base, declaredInvested: 0 });
    const without = computeNetWorthSplit(base);

    expect(withField).toEqual(without);
    expect(without.cash).toBe(1000);
  });
});

import { computeNetWorth, type NetWorthInput , purposeSplit } from "../networth";

function input(over: Partial<NetWorthInput> = {}): NetWorthInput {
  return {
    cash: 0,
    manualPortfolio: 0,
    syncedPortfolio: 0,
    openPositionValue: 0,
    floatingPortfolio: 0,
    ...over,
  };
}

describe("computeNetWorth", () => {
  it("adds cash and portfolio", () => {
    const r = computeNetWorth(input({ cash: 100, manualPortfolio: 50, syncedPortfolio: 25 }));
    expect(r.cash).toBe(100);
    expect(r.portfolio).toBe(75);
    expect(r.total).toBe(175);
  });

  // --- The four boundaries that have actually broken in this app ---

  it("never adds open position value, however large", () => {
    const r = computeNetWorth(input({ cash: 31000, openPositionValue: 29000 }));
    expect(r.total).toBe(31000);
    expect(r.excluded.openPositionValue).toBe(29000);
    expect(r.excluded.reason).toMatch(/already inside/i);
  });

  describe("filing positions as investments rather than cash", () => {
    it("moves them between the buckets without changing the total", () => {
      // The bug this fixes: a broker account holding €177 of ETFs reported all
      // of it as cash, because equity is the shape it arrives in. The total was
      // right and the split was nonsense — "Investments: €0" beside a portfolio.
      const r = computeNetWorth(input({ cash: 262.91, openPositionValue: 177.06 }));
      expect(r.total).toBe(262.91);
      expect(r.cash).toBe(85.85);
      expect(r.portfolio).toBe(177.06);
      expect(r.cash + r.portfolio).toBeCloseTo(r.total, 2);
    });

    it("adds them to what the market can move", () => {
      // Filing them as investments must not leave them counted as guaranteed.
      const r = computeNetWorth(input({ cash: 262.91, openPositionValue: 177.06 }));
      expect(r.floating).toBe(177.06);
      expect(r.guaranteed).toBe(85.85);
      expect(r.floating + r.guaranteed).toBeCloseTo(r.total, 2);
    });

    it("keeps manual and synced portfolio alongside them", () => {
      const r = computeNetWorth(
        input({ cash: 200, openPositionValue: 150, manualPortfolio: 40, syncedPortfolio: 10 })
      );
      expect(r.total).toBe(250);
      expect(r.portfolio).toBe(200);
      expect(r.cash).toBe(50);
    });

    it("never drives cash negative", () => {
      // Positions worth more than the equity containing them is a contradiction.
      // Rendering a negative cash figure would hide it behind a minus sign.
      const r = computeNetWorth(input({ cash: 100, openPositionValue: 400 }));
      expect(r.cash).toBe(0);
      expect(r.total).toBe(100);
      expect(r.portfolio).toBe(100);
    });

    it("changes nothing when there are no open positions", () => {
      const r = computeNetWorth(input({ cash: 500, openPositionValue: 0, manualPortfolio: 20 }));
      expect(r.cash).toBe(500);
      expect(r.portfolio).toBe(20);
      expect(r.total).toBe(520);
    });
  });

  it("counts synced spot exactly once, on the portfolio side", () => {
    // The connected account's cash is equity only; spot arrives separately.
    const r = computeNetWorth(input({ cash: 0, syncedPortfolio: 87.7 }));
    expect(r.total).toBe(87.7);
  });

  it("keeps manual positions and cash separate", () => {
    const r = computeNetWorth(input({ cash: 1000, manualPortfolio: 250 }));
    expect(r.total).toBe(1250);
  });

  it("splits guaranteed from market-exposed", () => {
    const r = computeNetWorth(
      input({ cash: 100, manualPortfolio: 100, syncedPortfolio: 50, floatingPortfolio: 100 })
    );
    expect(r.total).toBe(250);
    expect(r.floating).toBe(100);
    expect(r.guaranteed).toBe(150);
  });

  it("reports unconverted amounts instead of swallowing them", () => {
    const r = computeNetWorth(input({ cash: 100, unconverted: [{ amount: 5000, currency: "JPY" }] }));
    expect(r.total).toBe(100);
    expect(r.unconverted).toEqual([{ amount: 5000, currency: "JPY" }]);
  });

  it("handles an empty setup", () => {
    const r = computeNetWorth(input());
    expect(r.total).toBe(0);
    expect(r.guaranteed).toBe(0);
  });

  it("handles negative cash without pretending it's zero", () => {
    const r = computeNetWorth(input({ cash: -50, manualPortfolio: 100 }));
    expect(r.total).toBe(50);
  });

  it("rounds to cents rather than accumulating float noise", () => {
    const r = computeNetWorth(input({ cash: 0.1, manualPortfolio: 0.2 }));
    expect(r.total).toBe(0.3);
  });
});

/**
 * Net worth is assets minus liabilities, and for a long time this app did only
 * the first half. Anyone with a mortgage was shown a patrimony that did not
 * exist.
 */
describe("what you owe", () => {
  const assets = {
    cash: 10_000,
    manualPortfolio: 5_000,
    syncedPortfolio: 0,
    openPositionValue: 0,
    floatingPortfolio: 5_000,
  };

  it("takes debt off the headline and reports both sides", () => {
    const r = computeNetWorth({ ...assets, liabilities: 200_000 });

    expect(r.assets).toBe(15_000);
    expect(r.liabilities).toBe(200_000);
    // Owing more than you hold is a real situation, not an error to clamp away.
    expect(r.total).toBe(-185_000);
  });

  it("changes nothing at all when there is no debt", () => {
    // Every figure computed before liabilities existed has to stay identical.
    const withField = computeNetWorth({ ...assets, liabilities: 0 });
    const without = computeNetWorth(assets);

    expect(withField).toEqual(without);
    expect(without.total).toBe(without.assets);
  });

  it("leaves what you hold untouched", () => {
    // A mortgage does not make the cash in your account less spendable, nor
    // the ETFs in it less market-exposed.
    const clear = computeNetWorth(assets);
    const owing = computeNetWorth({ ...assets, liabilities: 200_000 });

    expect(owing.cash).toBe(clear.cash);
    expect(owing.portfolio).toBe(clear.portfolio);
    expect(owing.floating).toBe(clear.floating);
    expect(owing.guaranteed).toBe(clear.guaranteed);
  });

  it("refuses a negative liability rather than treating it as a windfall", () => {
    const r = computeNetWorth({ ...assets, liabilities: -5_000 });
    expect(r.liabilities).toBe(0);
    expect(r.total).toBe(15_000);
  });

  it("keeps assets, debt and the headline reconcilable", () => {
    const r = computeNetWorth({ ...assets, liabilities: 4_000 });
    expect(r.assets - r.liabilities).toBeCloseTo(r.total, 2);
  });
});

/**
 * The purpose slices describe money you hold. A mortgage is not a fifth purpose
 * your money is serving — it is money you do not have.
 */
describe("purpose slices against debt", () => {
  const result = computeNetWorth({
    cash: 10_000,
    manualPortfolio: 5_000,
    syncedPortfolio: 0,
    openPositionValue: 0,
    floatingPortfolio: 5_000,
    liabilities: 200_000,
  });

  it("does not shrink free cash by the outstanding loan", () => {
    // The wrong version reported nothing free to spend on the day a payment
    // was due, which is the worst possible moment to be told that.
    const split = purposeSplit({ result, investingCash: 0, promisedToBuckets: 0 });
    expect(split.free).toBe(10_000);
  });

  it("still adds up to what is held", () => {
    const split = purposeSplit({ result, investingCash: 0, promisedToBuckets: 2_000 });
    const sum = split.invested + split.waitingToInvest + split.promised + split.free;
    expect(sum).toBeCloseTo(result.assets, 2);
  });
});
