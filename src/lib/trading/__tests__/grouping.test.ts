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

  it("reads the free-form tags off the trade itself", () => {
    expect(groupValuesOf(row({ tags: ["breakout", "news"] }), "tag")).toEqual([
      "breakout",
      "news",
    ]);
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
 * `multi` decides what the screen is allowed to claim about the figures, so it
 * has to match how many values an axis can actually produce.
 */
describe("which axes overlap", () => {
  it("marks only the free-form tag axis as multi-valued", () => {
    const multi = TRADE_GROUPINGS.filter((g) => g.multi).map((g) => g.key);
    expect(multi).toEqual(["tag"]);
  });

  it("never yields more than one value on a single-valued axis", () => {
    const r = row({ classification: CLASSIFIED, tags: ["a", "b", "c"] });
    for (const g of TRADE_GROUPINGS.filter((x) => !x.multi)) {
      expect(groupValuesOf(r, g.key).length, g.key).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Which is what lets a single-valued axis be read as a breakdown: its rows
   * add up to the classified total, where the tag axis does not.
   */
  it("makes a single-valued axis add up, and the tag axis not", () => {
    const rows = [
      row({ id: "1", realizedPnl: 30, classification: CLASSIFIED, tags: ["a", "b"] }),
      row({ id: "2", realizedPnl: -10, classification: CLASSIFIED, tags: ["a"] }),
    ];

    const byRisk = byTag(rows, (r) => groupValuesOf(r as TradeHistoryRow, "riskLevel"));
    const riskTotal = byRisk.reduce((s, g) => s + g.realized, 0);
    const coverage = taggedTotals(rows, (r) =>
      groupValuesOf(r as TradeHistoryRow, "riskLevel")
    );
    expect(riskTotal).toBe(coverage.realized);

    const byLabel = byTag(rows, (r) => groupValuesOf(r as TradeHistoryRow, "tag"));
    const labelTotal = byLabel.reduce((s, g) => s + g.realized, 0);
    // 30 counted under "a" and "b", −10 under "a": 50 against a real 20.
    expect(labelTotal).toBe(50);
    expect(labelTotal).not.toBe(coverage.realized);
  });
});
