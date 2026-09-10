import { describe, it, expect } from "vitest";
import {
  axisCoverage,
  positionsNeedingTags,
  taggingSummary,
  ALLOCATION_AXES,
  type TaggablePosition,
} from "../untagged";

const position = (over: Partial<TaggablePosition> = {}): TaggablePosition => ({
  symbol: "HYPE",
  value: 100,
  riskLevel: null,
  expectedReturn: null,
  timeHorizon: null,
  liquidity: null,
  ...over,
});

/**
 * The shape of the live account: nothing fully classified, most positions
 * carrying two of four axes, and the whole portfolio's value sitting behind
 * the gap. Every breakdown on the analysis page was describing that.
 */
const REAL: TaggablePosition[] = [
  position({ symbol: "Amundi S&P 500", value: 105.71, riskLevel: "medium", liquidity: "high" }),
  position({ symbol: "iShares S&P 500", value: 90.04, riskLevel: "medium", liquidity: "high" }),
  position({ symbol: "Bitcoin", value: 79.18, riskLevel: "very_high", liquidity: "high" }),
  position({ symbol: "USDC", value: 67.11 }),
  position({ symbol: "HYPE", value: 55.23 }),
];

describe("how much of the portfolio each axis describes", () => {
  const coverage = axisCoverage(REAL);
  const of = (axis: string) => coverage.find((c) => c.axis === axis)!;

  it("reports one row per axis, in the order the form asks", () => {
    expect(coverage.map((c) => c.axis)).toEqual(ALLOCATION_AXES.map((a) => a.key));
  });

  it("counts the positions with an answer and the ones without", () => {
    expect(of("riskLevel")).toMatchObject({ tagged: 3, untagged: 2 });
    expect(of("timeHorizon")).toMatchObject({ tagged: 0, untagged: 5 });
  });

  /**
   * Weighted by money, because that is what a breakdown is drawn from. Three of
   * five positions carrying a risk level sounds like most of the portfolio; it
   * is 275 of 397, and the difference is the point.
   */
  it("weights the gap by value, not by how many rows are missing", () => {
    expect(of("riskLevel").untaggedValue).toBeCloseTo(122.34, 2);
    expect(of("riskLevel").coverage).toBeCloseTo(69.2, 1);
  });

  it("reports an axis nobody has answered as covering nothing", () => {
    expect(of("timeHorizon").coverage).toBe(0);
    expect(of("expectedReturn").coverage).toBe(0);
  });

  /**
   * Null, not zero. A percentage of an empty portfolio is a question with no
   * answer, and 0% would claim everything is unclassified.
   */
  it("has no coverage to report for a portfolio worth nothing", () => {
    expect(axisCoverage([]).every((c) => c.coverage === null)).toBe(true);
    expect(axisCoverage([position({ value: 0 })]).every((c) => c.coverage === null)).toBe(true);
  });

  /** An empty string is not an answer, whatever a form submitted. */
  it("does not count a blank as an answer", () => {
    const blank = axisCoverage([position({ value: 10, riskLevel: "   " })]);
    expect(blank.find((c) => c.axis === "riskLevel")!.untagged).toBe(1);
  });
});

describe("what to fill in next", () => {
  const gaps = positionsNeedingTags(REAL);

  /**
   * Ordered by money, not by how much is missing. Classifying the €105 holding
   * moves every breakdown on the page; classifying the €0.13 one moves nothing,
   * and a list ordered by incompleteness would put them the other way round.
   */
  it("leads with the position whose classification would change the most", () => {
    expect(gaps[0].symbol).toBe("Amundi S&P 500");
    expect(gaps.map((g) => g.value)).toEqual([...gaps.map((g) => g.value)].sort((a, b) => b - a));
  });

  it("names the axes each position is missing", () => {
    expect(gaps[0].missing.map((m) => m.axis)).toEqual(["expectedReturn", "timeHorizon"]);
    expect(gaps.find((g) => g.symbol === "USDC")!.missing).toHaveLength(4);
  });

  it("leaves out a position that is fully classified", () => {
    const done = position({
      symbol: "DONE",
      riskLevel: "low",
      expectedReturn: "conservative",
      timeHorizon: "long",
      liquidity: "high",
    });
    expect(positionsNeedingTags([done])).toEqual([]);
  });
});

describe("the summary above the list", () => {
  const summary = taggingSummary(REAL);

  it("says how little is actually classified", () => {
    expect(summary.positions).toBe(5);
    expect(summary.complete).toBe(0);
    expect(summary.untouched).toBe(2);
  });

  it("says how much money is behind the gap", () => {
    expect(summary.incompleteValue).toBeCloseTo(397.27, 2);
  });

  /** The axis worth starting on: the one describing least of the portfolio. */
  it("names the weakest axis", () => {
    expect(summary.weakest?.coverage).toBe(0);
    expect(["expectedReturn", "timeHorizon"]).toContain(summary.weakest?.axis);
  });

  it("has nothing to report about an empty portfolio", () => {
    const empty = taggingSummary([]);
    expect(empty).toMatchObject({ positions: 0, complete: 0, untouched: 0, incompleteValue: 0 });
  });

  it("says so when everything is classified", () => {
    const done = position({
      riskLevel: "low",
      expectedReturn: "conservative",
      timeHorizon: "long",
      liquidity: "high",
    });
    expect(taggingSummary([done])).toMatchObject({ positions: 1, complete: 1, untouched: 0 });
    expect(positionsNeedingTags([done])).toEqual([]);
  });
});
