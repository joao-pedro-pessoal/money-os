import { describe, it, expect } from "vitest";
import {
  breakdownBy,
  stableVsFloating,
  stakingSummary,
  topMovers,
  concentrationWarnings,
  horizonRiskMismatches,
  performanceBy,
  sortPerformance,
  type AnalysisHolding,
} from "../analysis";
import { marketValue, costBasis, unrealizedPnL } from "../index";

function h(over: Partial<AnalysisHolding> = {}): AnalysisHolding {
  return {
    id: "1",
    symbol: "X",
    quantity: 1,
    avgEntryPrice: 100,
    currentPrice: 100,
    ...over,
  };
}

describe("breakdownBy", () => {
  it("groups by key with correct percentages", () => {
    const holdings = [
      h({ id: "a", symbol: "A", assetType: "crypto", currentPrice: 300 }),
      h({ id: "b", symbol: "B", assetType: "stock_etf", currentPrice: 100 }),
    ];
    const result = breakdownBy(holdings, (x) => x.assetType);
    expect(result).toEqual([
      { key: "crypto", value: 300, percent: 75 },
      { key: "stock_etf", value: 100, percent: 25 },
    ]);
  });

  it("buckets missing keys under the unset label instead of dropping them", () => {
    const holdings = [h({ currentPrice: 50, assetType: null }), h({ id: "2", currentPrice: 50, assetType: "cash" })];
    const result = breakdownBy(holdings, (x) => x.assetType);
    const unset = result.find((r) => r.key === "unset");
    expect(unset?.value).toBe(50);
    expect(result.reduce((s, r) => s + r.value, 0)).toBe(100);
  });

  it("returns zero percentages for an empty portfolio rather than dividing by zero", () => {
    expect(breakdownBy([], (x) => x.assetType)).toEqual([]);
  });
});

describe("stableVsFloating", () => {
  it("treats cash and stablecoins as guaranteed and everything else as floating", () => {
    const holdings = [
      h({ assetType: "cash", currentPrice: 200 }),
      h({ id: "2", assetType: "stablecoin", currentPrice: 300 }),
      h({ id: "3", assetType: "crypto", currentPrice: 500 }),
    ];
    expect(stableVsFloating(holdings)).toEqual({ stable: 500, floating: 500, floatingPercent: 50 });
  });

  it("treats an untagged holding as floating (conservative default)", () => {
    expect(stableVsFloating([h({ assetType: null, currentPrice: 100 })])).toEqual({
      stable: 0,
      floating: 100,
      floatingPercent: 100,
    });
  });

  it("handles an empty portfolio", () => {
    expect(stableVsFloating([])).toEqual({ stable: 0, floating: 0, floatingPercent: 0 });
  });
});

describe("stakingSummary", () => {
  it("projects annual income from APR and sums rewards already received", () => {
    const holdings = [
      h({ quantity: 10, currentPrice: 100, apr: 5, rewardsEarned: 20 }), // 1000 @ 5% = 50
      h({ id: "2", quantity: 1, currentPrice: 1000, apr: 10, rewardsEarned: 30 }), // 1000 @ 10% = 100
    ];
    const s = stakingSummary(holdings);
    expect(s.stakedValue).toBe(2000);
    expect(s.projectedAnnual).toBe(150);
    expect(s.rewardsEarned).toBe(50);
    expect(s.weightedApr).toBe(7.5);
  });

  it("ignores positions without an APR when computing staked value", () => {
    const s = stakingSummary([h({ currentPrice: 500 }), h({ id: "2", currentPrice: 500, apr: 4 })]);
    expect(s.stakedValue).toBe(500);
    expect(s.projectedAnnual).toBe(20);
  });

  it("handles an empty portfolio without dividing by zero", () => {
    expect(stakingSummary([])).toEqual({ stakedValue: 0, projectedAnnual: 0, rewardsEarned: 0, weightedApr: 0 });
  });
});

describe("topMovers", () => {
  it("separates winners and losers ordered by size of the move", () => {
    const holdings = [
      h({ id: "w1", symbol: "W1", avgEntryPrice: 100, currentPrice: 150 }), // +50
      h({ id: "w2", symbol: "W2", avgEntryPrice: 100, currentPrice: 120 }), // +20
      h({ id: "l1", symbol: "L1", avgEntryPrice: 100, currentPrice: 40 }), // -60
    ];
    const { winners, losers } = topMovers(holdings);
    expect(winners.map((w) => w.symbol)).toEqual(["W1", "W2"]);
    expect(losers.map((l) => l.symbol)).toEqual(["L1"]);
    expect(losers[0].pnl).toBe(-60);
  });

  it("excludes flat positions from both lists", () => {
    const { winners, losers } = topMovers([h({ avgEntryPrice: 100, currentPrice: 100 })]);
    expect(winners).toHaveLength(0);
    expect(losers).toHaveLength(0);
  });
});

describe("concentrationWarnings", () => {
  it("flags a position above the threshold share of the portfolio", () => {
    const holdings = [
      h({ id: "a", symbol: "BIG", currentPrice: 800 }),
      h({ id: "b", symbol: "SMALL", currentPrice: 200 }),
    ];
    const warnings = concentrationWarnings(holdings, 25);
    expect(warnings.map((w) => w.key)).toEqual(["BIG"]);
    expect(warnings[0].percent).toBe(80);
  });

  it("returns nothing for an evenly spread portfolio", () => {
    const holdings = [
      h({ id: "a", symbol: "A", currentPrice: 250 }),
      h({ id: "b", symbol: "B", currentPrice: 250 }),
      h({ id: "c", symbol: "C", currentPrice: 250 }),
      h({ id: "d", symbol: "D", currentPrice: 250 }),
    ];
    expect(concentrationWarnings(holdings, 25)).toEqual([]);
  });
});

describe("horizonRiskMismatches", () => {
  it("flags short-term money sitting in high-risk positions", () => {
    const holdings = [
      h({ id: "bad", symbol: "BAD", timeHorizon: "short", riskLevel: "very_high" }),
      h({ id: "ok", symbol: "OK", timeHorizon: "long", riskLevel: "very_high" }),
      h({ id: "ok2", symbol: "OK2", timeHorizon: "short", riskLevel: "low" }),
    ];
    expect(horizonRiskMismatches(holdings).map((x) => x.symbol)).toEqual(["BAD"]);
  });
});

describe("performanceBy", () => {
  const holdings = [
    h({ id: "1", symbol: "A", playlistName: "Reforma", quantity: 10, avgEntryPrice: 100, currentPrice: 150 }),
    h({ id: "2", symbol: "B", playlistName: "Reforma", quantity: 10, avgEntryPrice: 100, currentPrice: 110 }),
    h({ id: "3", symbol: "C", playlistName: "Especulação", quantity: 10, avgEntryPrice: 100, currentPrice: 50 }),
  ];

  it("aggregates value, cost and P&L per group", () => {
    const rows = performanceBy(holdings, "playlist");
    const reforma = rows.find((r) => r.key === "Reforma")!;
    expect(reforma.value).toBe(2600); // 1500 + 1100
    expect(reforma.cost).toBe(2000);
    expect(reforma.pnl).toBe(600);
    expect(reforma.pnlPercent).toBe(30);
    expect(reforma.count).toBe(2);
  });

  it("shows a losing group with negative P&L", () => {
    const esp = performanceBy(holdings, "playlist").find((r) => r.key === "Especulação")!;
    expect(esp.pnl).toBe(-500);
    expect(esp.pnlPercent).toBe(-50);
  });

  it("labels ungrouped holdings instead of dropping them", () => {
    const rows = performanceBy([h({ playlistName: null, currentPrice: 100 })], "playlist");
    expect(rows[0].key).toBe("Unset");
  });

  it("defaults direction to long when unset", () => {
    const rows = performanceBy([h({ direction: null })], "direction");
    expect(rows[0].key).toBe("long");
  });

  it("sums realized P&L per group", () => {
    const rows = performanceBy(
      [h({ playlistName: "P", realizedPnl: 120 }), h({ id: "2", playlistName: "P", realizedPnl: 30 })],
      "playlist"
    );
    expect(rows[0].realized).toBe(150);
  });
});

describe("sortPerformance", () => {
  const rows = performanceBy(
    [
      h({ id: "1", symbol: "SMALL", quantity: 1, avgEntryPrice: 100, currentPrice: 100 }),
      h({ id: "2", symbol: "BIG", quantity: 10, avgEntryPrice: 100, currentPrice: 100 }),
    ],
    "symbol"
  );

  it("sorts by value descending by default", () => {
    expect(sortPerformance(rows).map((r) => r.key)).toEqual(["BIG", "SMALL"]);
  });

  it("sorts ascending when asked", () => {
    expect(sortPerformance(rows, "value", "asc").map((r) => r.key)).toEqual(["SMALL", "BIG"]);
  });

  it("sorts alphabetically on a text column", () => {
    expect(sortPerformance(rows, "key", "asc").map((r) => r.key)).toEqual(["BIG", "SMALL"]);
  });
});

/**
 * The Analysis page read the `holdings` table and nothing else, so it analysed
 * 456 € of a 789 € portfolio and presented the percentages as the whole
 * picture. These assert the mapping that now feeds it: a portfolio item's
 * value, cost and P&L survive the trip into an AnalysisHolding intact.
 */
describe("analysing an item that carries value and P&L rather than prices", () => {
  /** The mapping getPortfolioAnalysis applies. One unit, priced at the value. */
  const asHolding = (over: { value: number; pnl: number } & Partial<AnalysisHolding>) => ({
    id: "x",
    symbol: "X",
    quantity: 1,
    currentPrice: over.value,
    avgEntryPrice: Math.round((over.value - over.pnl) * 100) / 100,
    direction: "long",
    ...over,
  }) as AnalysisHolding;

  it("keeps value, cost and P&L exactly", () => {
    const h = asHolding({ value: 146.31, pnl: -0.02 });

    expect(marketValue(h)).toBeCloseTo(146.31, 2);
    expect(costBasis(h)).toBeCloseTo(146.33, 2);
    expect(unrealizedPnL(h)).toBeCloseTo(-0.02, 2);
  });

  it("does not force a synced position to look break-even", () => {
    // The old mapping used quantity = value with both prices at 1, which made
    // cost equal value and P&L zero by construction.
    const h = asHolding({ value: 87.56, pnl: 4.94 });

    expect(unrealizedPnL(h)).toBeCloseTo(4.94, 2);
    expect(costBasis(h)).toBeCloseTo(82.62, 2);
  });

  it("totals a mixed portfolio without losing the synced side", () => {
    const holdings = [
      asHolding({ id: "tr", value: 456.54, pnl: 31.85 }),
      asHolding({ id: "t212", value: 146.31, pnl: -0.02 }),
      asHolding({ id: "ibkr", value: 33.54, pnl: 0.73 }),
      asHolding({ id: "hype", value: 74.85, pnl: 4.22 }),
    ];

    const total = holdings.reduce((s, h) => s + marketValue(h), 0);
    // All four sources present, not just the imported one.
    expect(total).toBeCloseTo(711.24, 1);
    expect(total).toBeGreaterThan(456.54);
  });
});

/**
 * Opening a group to see what it is made of.
 *
 * The members are the very rows the group's totals were summed from, carried
 * on the group rather than fetched again when a row is opened — a detail
 * fetched separately can disagree with the total above it, and the reader has
 * no way to tell which is right.
 */
describe("what a group is made of", () => {
  const holdings = [
    { symbol: "BIG", quantity: 10, avgEntryPrice: 10, currentPrice: 12, timeHorizon: "long" },
    { symbol: "SMALL", quantity: 1, avgEntryPrice: 10, currentPrice: 11, timeHorizon: "long" },
    { symbol: "OTHER", quantity: 5, avgEntryPrice: 10, currentPrice: 9, timeHorizon: "short" },
  ] as Parameters<typeof performanceBy>[0];

  const groups = performanceBy(holdings, "timeHorizon");
  const long = groups.find((g) => g.key === "long")!;

  it("lists the members of each group, largest first", () => {
    expect(long.members.map((m) => m.symbol)).toEqual(["BIG", "SMALL"]);
    expect(long.count).toBe(long.members.length);
  });

  /**
   * Of the group, not of the portfolio. The group's own share of the portfolio
   * is on the row above, and repeating it here would answer a question nobody
   * asked while hiding the one they did.
   */
  it("weighs each member inside its own group", () => {
    // 120 and 11 of 131.
    expect(long.members[0].shareOfGroup).toBeCloseTo(91.6, 1);
    expect(long.members[1].shareOfGroup).toBeCloseTo(8.4, 1);
    expect(long.members.reduce((s, m) => s + m.shareOfGroup, 0)).toBeCloseTo(100, 1);
  });

  it("adds up to the group's own totals", () => {
    expect(long.members.reduce((s, m) => s + m.value, 0)).toBeCloseTo(long.value, 2);
    expect(long.members.reduce((s, m) => s + m.cost, 0)).toBeCloseTo(long.cost, 2);
    expect(long.members.reduce((s, m) => s + m.pnl, 0)).toBeCloseTo(long.pnl, 2);
  });

  /**
   * A holding's own realizedPnl is only ever written by a manual sale, so for
   * anyone whose trades arrive from a connector or an import it is zero for
   * every position — which made this column structurally unable to show
   * anything else. The trade history's figure wins where there is one.
   */
  it("takes realised from the trade history where it knows one", () => {
    const withRealised = performanceBy(
      holdings,
      "timeHorizon",
      "Unset",
      new Map([["BIG", -16.51]])
    );
    const g = withRealised.find((x) => x.key === "long")!;
    expect(g.realized).toBeCloseTo(-16.51, 2);
    expect(g.members.find((m) => m.symbol === "BIG")!.realized).toBeCloseTo(-16.51, 2);
    expect(g.members.find((m) => m.symbol === "SMALL")!.realized).toBe(0);
  });

  it("falls back to the holding's own figure when the history knows none", () => {
    const manual = performanceBy(
      [{ symbol: "SOLD", quantity: 1, avgEntryPrice: 10, currentPrice: 10, realizedPnl: 4 }] as Parameters<typeof performanceBy>[0],
      "symbol"
    );
    expect(manual[0].realized).toBe(4);
  });

  /** A group worth nothing has no shares to divide between its members. */
  it("does not invent weights inside a worthless group", () => {
    const empty = performanceBy(
      [{ symbol: "ZERO", quantity: 0, avgEntryPrice: 10, currentPrice: 10 }] as Parameters<typeof performanceBy>[0],
      "symbol"
    );
    expect(empty[0].members[0].shareOfGroup).toBe(0);
  });
});
