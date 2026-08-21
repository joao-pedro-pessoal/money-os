import { describe, it, expect } from "vitest";
import {
  purposeTotals,
  clampPercent,
  allocatedPercent,
  isOverAllocated,
  unallocatedPercent,
  goalProgress,
  type CashAllocation,
  type HoldingAllocation,
} from "../purpose";

const cash = (bucketId: string, amount: number, accountId = "acc"): CashAllocation => ({
  bucketId,
  accountId,
  amount,
});

const held = (o: Partial<HoldingAllocation> & { bucketId: string }): HoldingAllocation => ({
  holdingId: "h1",
  percent: 100,
  marketValue: 1000,
  costBasis: 800,
  floating: true,
  ...o,
});

describe("purposeTotals", () => {
  it("adds cash from several accounts", () => {
    // The case the critique said was impossible: one goal, three places.
    const totals = purposeTotals(
      "house",
      [cash("house", 1000, "millennium"), cash("house", 2000, "tr"), cash("other", 500)],
      []
    );
    expect(totals.cash).toBe(3000);
    expect(totals.total).toBe(3000);
  });

  it("counts only the allocated share of a position", () => {
    const totals = purposeTotals("house", [], [held({ bucketId: "house", percent: 70 })]);
    expect(totals.invested).toBe(700);
    expect(totals.investedCost).toBe(560);
    expect(totals.investedPnl).toBe(140);
  });

  it("splits one position between two goals", () => {
    const allocations = [
      held({ bucketId: "house", percent: 70 }),
      held({ bucketId: "longterm", percent: 30 }),
    ];
    expect(purposeTotals("house", [], allocations).invested).toBe(700);
    expect(purposeTotals("longterm", [], allocations).invested).toBe(300);
  });

  it("mixes cash and investments in one goal", () => {
    const totals = purposeTotals(
      "house",
      [cash("house", 1000), cash("house", 2000)],
      [held({ bucketId: "house", percent: 50, marketValue: 3000, costBasis: 2800 })]
    );
    expect(totals.total).toBe(4500);
    expect(totals.cash).toBe(3000);
    expect(totals.invested).toBe(1500);
  });

  it("separates what can fall from what cannot", () => {
    const totals = purposeTotals(
      "house",
      [cash("house", 1000)],
      [
        held({ bucketId: "house", holdingId: "etf", percent: 100, marketValue: 2000, floating: true }),
        held({
          bucketId: "house",
          holdingId: "usdc",
          percent: 100,
          marketValue: 500,
          floating: false,
        }),
      ]
    );
    // Cash and the stablecoin are stable; only the ETF is exposed.
    expect(totals.stable).toBe(1500);
    expect(totals.floating).toBe(2000);
    expect(totals.total).toBe(3500);
  });

  it("reports a loss on the allocated share", () => {
    const totals = purposeTotals(
      "house",
      [],
      [held({ bucketId: "house", percent: 50, marketValue: 800, costBasis: 1200 })]
    );
    // A goal funded by investments can go down, and this says so.
    expect(totals.investedPnl).toBe(-200);
  });

  it("reports no P&L when a cost is unknown rather than guessing zero", () => {
    const totals = purposeTotals(
      "house",
      [],
      [
        held({ bucketId: "house", holdingId: "a", costBasis: 800 }),
        held({ bucketId: "house", holdingId: "b", costBasis: null }),
      ]
    );
    expect(totals.investedPnl).toBe(0);
    expect(totals.investedCost).toBe(0);
  });

  it("is all zeroes for an empty goal", () => {
    const totals = purposeTotals("empty", [], []);
    expect(totals).toMatchObject({ total: 0, cash: 0, invested: 0, floating: 0, stable: 0 });
  });
});

describe("clampPercent", () => {
  it("keeps a percentage inside 0-100", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(42)).toBe(42);
  });

  it("treats junk as zero, not as everything", () => {
    // Both fail the finite check and fall to 0. That direction is deliberate:
    // an unreadable input must not silently promise the whole position to a
    // goal. Allocating nothing is recoverable; allocating everything is not.
    expect(clampPercent(NaN)).toBe(0);
    expect(clampPercent(Infinity)).toBe(0);
    expect(clampPercent(-Infinity)).toBe(0);
  });
});

describe("allocation limits", () => {
  const allocations = [
    held({ bucketId: "house", holdingId: "etf", percent: 70 }),
    held({ bucketId: "longterm", holdingId: "etf", percent: 30 }),
    held({ bucketId: "house", holdingId: "btc", percent: 90 }),
  ];

  it("adds up the share promised across goals", () => {
    expect(allocatedPercent("etf", allocations)).toBe(100);
    expect(allocatedPercent("btc", allocations)).toBe(90);
  });

  it("reports what is still free", () => {
    expect(unallocatedPercent("etf", allocations)).toBe(0);
    expect(unallocatedPercent("btc", allocations)).toBe(10);
  });

  it("flags promising more of a position than exists", () => {
    const over = [
      held({ bucketId: "a", holdingId: "etf", percent: 70 }),
      held({ bucketId: "b", holdingId: "etf", percent: 70 }),
    ];
    expect(isOverAllocated("etf", over)).toBe(true);
  });

  it("does not raise a false alarm at exactly 100", () => {
    expect(isOverAllocated("etf", allocations)).toBe(false);
  });

  it("tolerates rounding dust", () => {
    const dusty = [
      held({ bucketId: "a", holdingId: "x", percent: 33.33 }),
      held({ bucketId: "b", holdingId: "x", percent: 33.33 }),
      held({ bucketId: "c", holdingId: "x", percent: 33.34 }),
    ];
    expect(isOverAllocated("x", dusty)).toBe(false);
  });
});

describe("goalProgress", () => {
  const totals = purposeTotals(
    "house",
    [cash("house", 2000)],
    [held({ bucketId: "house", percent: 100, marketValue: 3000, floating: true })]
  );

  it("reports progress twice, headline and conservative", () => {
    const p = goalProgress(totals, 10000);
    expect(p.percent).toBe(50);
    // Only the €2 000 of cash survives a bad month.
    expect(p.conservativePercent).toBe(20);
  });

  it("knows when the goal is reached", () => {
    expect(goalProgress(totals, 5000).reached).toBe(true);
    expect(goalProgress(totals, 5001).reached).toBe(false);
  });

  it("has no percentage without a target", () => {
    const p = goalProgress(totals, null);
    expect(p.percent).toBeNull();
    expect(p.current).toBe(5000);
  });

  it("does not divide by zero", () => {
    expect(goalProgress(totals, 0).percent).toBeNull();
  });
});
