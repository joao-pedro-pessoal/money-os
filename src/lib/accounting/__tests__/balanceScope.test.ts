import { describe, it, expect } from "vitest";
import {
  meaningOf,
  isBalanceMeaning,
  holdingCountsOnTop,
  accountBreakdown,
  suspectsDoubleCount,
  needsInvestedValue,
  investedExceedsBalance,
  type AccountShape,
} from "../balanceScope";

const account = (o: Partial<AccountShape> = {}): AccountShape => ({
  id: "a",
  balance: 0,
  meaning: "cash_only",
  holdingsValue: 0,
  synced: false,
  ...o,
});

describe("meaningOf", () => {
  it("defaults to the historical assumption", () => {
    // Existing rows have no value; they must keep behaving as before.
    expect(meaningOf(null)).toBe("cash_only");
    expect(meaningOf(undefined)).toBe("cash_only");
    expect(meaningOf("")).toBe("cash_only");
  });

  it("rejects a value it doesn't understand rather than trusting it", () => {
    expect(meaningOf("whatever")).toBe("cash_only");
    expect(isBalanceMeaning("whatever")).toBe(false);
  });

  it("keeps a valid value", () => {
    expect(meaningOf("includes_positions")).toBe("includes_positions");
  });
});

describe("holdingCountsOnTop", () => {
  const meanings = new Map([
    ["cash", "cash_only" as const],
    ["broker", "includes_positions" as const],
  ]);

  it("counts a holding attached to nothing", () => {
    expect(holdingCountsOnTop(null, meanings)).toBe(true);
    expect(holdingCountsOnTop(undefined, meanings)).toBe(true);
  });

  it("counts a holding in a cash-only account", () => {
    expect(holdingCountsOnTop("cash", meanings)).toBe(true);
  });

  it("does NOT count a holding already inside the balance", () => {
    // This is the sixth double-count. The ETF is inside the 12 400 € you
    // read off the broker's app; adding it again invents money.
    expect(holdingCountsOnTop("broker", meanings)).toBe(false);
  });

  it("counts a holding in an account it knows nothing about", () => {
    expect(holdingCountsOnTop("ghost", meanings)).toBe(true);
  });
});

describe("accountBreakdown", () => {
  it("adds positions on top for a cash account", () => {
    const b = accountBreakdown(account({ balance: 100, holdingsValue: 900 }));
    expect(b).toMatchObject({ cash: 100, portfolioOnTop: 900, alreadyInside: 0, total: 1000 });
  });

  it("keeps the total flat when positions are already inside", () => {
    const b = accountBreakdown(
      account({ balance: 12400, holdingsValue: 11000, meaning: "includes_positions" })
    );
    // The account is worth 12 400, not 23 400.
    expect(b.total).toBe(12400);
    expect(b.portfolioOnTop).toBe(0);
    expect(b.alreadyInside).toBe(11000);
  });

  it("is unaffected by holdings when there are none", () => {
    expect(accountBreakdown(account({ balance: 500 })).total).toBe(500);
  });
});

describe("suspectsDoubleCount", () => {
  it("flags a big cash-only balance sitting next to positions", () => {
    expect(suspectsDoubleCount(account({ balance: 12400, holdingsValue: 11000 }))).toBe(true);
  });

  it("stays quiet when the cash is small next to the positions", () => {
    // 200 € uninvested alongside 11 000 € of stock is exactly normal.
    expect(suspectsDoubleCount(account({ balance: 200, holdingsValue: 11000 }))).toBe(false);
  });

  it("stays quiet for a synced account", () => {
    // The connector already declared its own rule; second-guessing it here
    // would produce a warning about a case that is provably handled.
    expect(
      suspectsDoubleCount(account({ balance: 12400, holdingsValue: 11000, synced: true }))
    ).toBe(false);
  });

  it("stays quiet once the account has been told what it means", () => {
    expect(
      suspectsDoubleCount(
        account({ balance: 12400, holdingsValue: 11000, meaning: "includes_positions" })
      )
    ).toBe(false);
  });

  it("stays quiet with no positions at all", () => {
    expect(suspectsDoubleCount(account({ balance: 12400 }))).toBe(false);
  });

  it("stays quiet with no balance", () => {
    expect(suspectsDoubleCount(account({ holdingsValue: 11000 }))).toBe(false);
  });
});

/**
 * An account that is a bank and a broker at once.
 *
 * Trade Republic: one IBAN, one card, one securities pocket, one total. Two
 * accounts would add up correctly and still be wrong — whichever half you split
 * off, the other inherits its nature, so the card money gets filed as invested
 * or the ETFs get filed as capital-guaranteed.
 */
describe("one account that is both", () => {
  const tr = (over: Partial<AccountShape> = {}): AccountShape => ({
    id: "tr",
    balance: 1000,
    meaning: "bank_and_broker" as const,
    holdingsValue: 0,
    synced: false,
    investedValue: 800,
    ...over,
  });

  it("splits the balance without changing it", () => {
    const b = accountBreakdown(tr());

    expect(b.cash).toBe(200);
    expect(b.portfolioOnTop).toBe(800);
    // The invariant that keeps Net Worth honest: the halves are the whole.
    expect(b.cash + b.portfolioOnTop).toBe(b.total);
    expect(b.total).toBe(1000);
  });

  it("holds the total constant however the split moves", () => {
    for (const invested of [0, 1, 250.55, 999.99, 1000]) {
      const b = accountBreakdown(tr({ investedValue: invested }));
      expect(b.cash + b.portfolioOnTop).toBeCloseTo(1000, 8);
    }
  });

  it("refuses to invent cash out of an oversized invested figure", () => {
    // Claiming more invested than the account holds would drive cash negative,
    // and a negative cash bucket is not a thing that exists.
    const b = accountBreakdown(tr({ investedValue: 1500 }));

    expect(b.cash).toBe(0);
    expect(b.portfolioOnTop).toBe(1000);
    expect(b.total).toBe(1000);
  });

  it("treats a missing split as nothing invested, and says so separately", () => {
    const b = accountBreakdown(tr({ investedValue: null }));

    expect(b.cash).toBe(1000);
    // Silent otherwise: an account full of ETFs would report itself as
    // capital-guaranteed and nothing on screen would look broken.
    expect(needsInvestedValue(tr({ investedValue: null }))).toBe(true);
    expect(needsInvestedValue(tr())).toBe(false);
  });

  it("flags an invested figure bigger than the account", () => {
    // Likeliest cause: the balance is the cash half only, so the account's
    // total is understated. Clamping alone would hide that.
    expect(investedExceedsBalance(tr({ investedValue: 1500 }))).toBe(true);
    expect(investedExceedsBalance(tr())).toBe(false);
  });

  it("keeps positions as detail, never added on top", () => {
    const b = accountBreakdown(tr({ holdingsValue: 750 }));

    expect(b.alreadyInside).toBe(750);
    expect(b.total).toBe(1000);
  });

  it("leaves the two older meanings exactly as they were", () => {
    expect(accountBreakdown({ ...tr(), meaning: "cash_only", holdingsValue: 300 })).toMatchObject(
      { cash: 1000, portfolioOnTop: 300, total: 1300 }
    );
    expect(
      accountBreakdown({ ...tr(), meaning: "includes_positions", holdingsValue: 300 })
    ).toMatchObject({ cash: 1000, portfolioOnTop: 0, alreadyInside: 300, total: 1000 });
  });
});
