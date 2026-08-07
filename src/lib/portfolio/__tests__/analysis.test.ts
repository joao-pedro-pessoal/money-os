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
    expect(rows[0].key).toBe("Sem definição");
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
