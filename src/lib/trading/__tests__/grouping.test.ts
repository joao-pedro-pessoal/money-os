import { describe, it, expect } from "vitest";
import { TRADE_GROUPINGS, groupValuesOf, type TradeHistoryRow } from "../filter";
import { byTag, taggedTotals } from "../stats";

const row = (over: Partial<TradeHistoryRow>): TradeHistoryRow => ({
  id: "1",
  date: "2026-06-01T00:00:00.000Z",
  type: "SELL",
  symbol: "HYPE",
  quantity: 1,
  amount: 10,
  fees: null,
  realizedPnl: 10,
  description: null,
  accountName: "MEXC",
  currency: "EUR",
  tags: [],
  ...over,
});

const CLASSIFIED = {
  connectionId: "c1",
  coin: "HYPE",
  assetTypeAuto: false,
  apr: null,
  playlistId: "p1",
  notes: null,
  assetType: "crypto",
  riskLevel: "medium",
  expectedReturn: "moderate",
  timeHorizon: "medium",
  liquidity: "high",
  playlistName: "Div Commodities",
};

describe("what a trade can be grouped by", () => {
  it("reads every classification axis off the position's own metadata", () => {
    const r = row({ classification: CLASSIFIED });
    expect(groupValuesOf(r, "assetType")).toEqual(["crypto"]);
    expect(groupValuesOf(r, "riskLevel")).toEqual(["medium"]);
    expect(groupValuesOf(r, "expectedReturn")).toEqual(["moderate"]);
    expect(groupValuesOf(r, "timeHorizon")).toEqual(["medium"]);
    expect(groupValuesOf(r, "liquidity")).toEqual(["high"]);
    expect(groupValuesOf(r, "playlistName")).toEqual(["Div Commodities"]);
  });

  /**
   * The one that makes this feature possible at all. `position_meta` outlives
   * the position: selling out entirely removes the holding, not what you said
   * about the instrument, so a trade closed months ago can still be grouped by
   * the risk you gave it.
   */
  it("still classifies an instrument that is no longer held", () => {
    // Nothing here refers to a holding. The classification travels on the row.
    const sold = row({ symbol: "FIL", classification: { ...CLASSIFIED, riskLevel: "low" } });
    expect(groupValuesOf(sold, "riskLevel")).toEqual(["low"]);
  });

  /**
   * An empty list rather than an "unset" value, which is what keeps an
   * unclassified trade out of every group instead of inventing a bucket that
   * would hold most of the history and say nothing.
   */
  it("gives an unclassified trade no group on any axis", () => {
    const bare = row({ classification: null });
    for (const g of TRADE_GROUPINGS) {
      expect(groupValuesOf(bare, g.key), g.key).toEqual([]);
    }
  });

  it("treats an axis nobody set as unclassified, not as a value", () => {
    const partial = row({ classification: { ...CLASSIFIED, liquidity: null } });
    expect(groupValuesOf(partial, "liquidity")).toEqual([]);
    expect(groupValuesOf(partial, "riskLevel")).toEqual(["medium"]);
  });

  it("handles a row that was never given a classification field at all", () => {
    expect(groupValuesOf(row({}), "assetType")).toEqual([]);
  });
});

/**
 * Every axis is single-valued, which is what lets the screen present these
 * rows as a breakdown. A free-form tag axis lived here briefly and could not
 * be: a trade wearing three tags was counted under all three.
 */
describe("every axis partitions the classified history", () => {
  it("never yields more than one value", () => {
    const r = row({ classification: CLASSIFIED });
    for (const g of TRADE_GROUPINGS) {
      expect(groupValuesOf(r, g.key).length, g.key).toBeLessThanOrEqual(1);
    }
  });

  it("adds up to the coverage total, so it can honestly be called a breakdown", () => {
    const rows = [
      row({ id: "1", realizedPnl: 30, classification: CLASSIFIED }),
      row({ id: "2", realizedPnl: -10, classification: { ...CLASSIFIED, riskLevel: "low" } }),
      // Unclassified: in no row, and in neither total.
      row({ id: "3", realizedPnl: 999, classification: null }),
    ];

    const byRisk = byTag(rows, (r) => groupValuesOf(r as TradeHistoryRow, "riskLevel"));
    const total = byRisk.reduce((s, g) => s + g.realized, 0);
    const coverage = taggedTotals(rows, (r) => groupValuesOf(r as TradeHistoryRow, "riskLevel"));

    expect(byRisk).toHaveLength(2);
    expect(total).toBe(coverage.realized);
    expect(coverage).toEqual({ tagged: 2, untagged: 1, realized: 20 });
  });
});
