import { describe, it, expect } from "vitest";
import {
  applyEntryOverride,
  venuePnlIsReproducible,
  describePnlSource,
  spotCostBasis,
  venueEntryPerUnit,
  entryOverrideFor,
} from "../entryOverride";

/** Trading 212's IPRP: price and value in the same currency, exact. */
const PLAIN = {
  size: 10,
  entryPrice: 100,
  markPrice: 110,
  unrealizedPnl: 100,
  side: "long",
};

/**
 * Trading 212's IGLA: quoted in dollars inside a euro account. Its own prices
 * give −0.41 while the venue reports −0.33, and the 0.08 between them is the
 * currency's move since it was opened.
 */
const FOREIGN = {
  size: 9.01342049,
  entryPrice: 4.7407086,
  markPrice: 4.6861,
  unrealizedPnl: -0.33,
  side: "long",
};

describe("whether the venue's own numbers explain each other", () => {
  it("is true when the prices give back the venue's result", () => {
    expect(venuePnlIsReproducible(PLAIN)).toBe(true);
  });

  it("is false when something the prices do not carry is inside it", () => {
    expect(venuePnlIsReproducible(FOREIGN)).toBe(false);
  });

  it("handles a short, where the sign runs the other way", () => {
    expect(
      venuePnlIsReproducible({ size: 2, entryPrice: 50, markPrice: 40, unrealizedPnl: 20, side: "short" })
    ).toBe(true);
    // The long reading of the same row would be −20, so the sign is really tested.
    expect(
      venuePnlIsReproducible({ size: 2, entryPrice: 50, markPrice: 40, unrealizedPnl: 20, side: "long" })
    ).toBe(false);
  });

  it("cannot judge a position with a figure missing", () => {
    expect(venuePnlIsReproducible({ ...PLAIN, markPrice: null })).toBe(false);
    expect(venuePnlIsReproducible({ ...PLAIN, unrealizedPnl: null })).toBe(false);
  });
});

describe("with no override", () => {
  it("leaves the venue's reading exactly as it was", () => {
    expect(applyEntryOverride(PLAIN, null)).toEqual({
      entryPrice: 100,
      unrealizedPnl: 100,
      pnlSource: "venue",
      overridden: false,
    });
  });

  /** Absent is not zero, here as everywhere. */
  it("keeps an absent P&L absent", () => {
    const none = applyEntryOverride({ ...PLAIN, unrealizedPnl: null }, null);
    expect(none.unrealizedPnl).toBeNull();
  });
});

describe("with an override the arithmetic can honour", () => {
  const out = applyEntryOverride(PLAIN, 90);

  it("shows your entry", () => {
    expect(out.entryPrice).toBe(90);
    expect(out.overridden).toBe(true);
  });

  it("restates the result from it", () => {
    // (110 − 90) × 10, against the venue's 100 from an entry of 100.
    expect(out.unrealizedPnl).toBe(200);
    expect(out.pnlSource).toBe("yours");
  });

  it("says the figure is no longer the platform's", () => {
    expect(describePnlSource(out.pnlSource)).toContain("not the platform's");
  });

  it("runs the sign the right way on a short", () => {
    const short = applyEntryOverride(
      { size: 2, entryPrice: 50, markPrice: 40, unrealizedPnl: 20, side: "short" },
      60
    );
    // Shorting higher makes more: (60 − 40) × 2.
    expect(short.unrealizedPnl).toBe(40);
  });
});

describe("with an override the arithmetic cannot honour", () => {
  const out = applyEntryOverride(FOREIGN, 4.5);

  it("still shows your entry", () => {
    expect(out.entryPrice).toBe(4.5);
    expect(out.overridden).toBe(true);
  });

  /**
   * The rule this file exists for. Recomputing would have produced a euro
   * column holding a dollar figure, and quietly replaced a number the venue
   * knows with one nobody can check.
   */
  it("leaves the result the venue's, rather than inventing one", () => {
    expect(out.unrealizedPnl).toBe(-0.33);
    expect(out.pnlSource).toBe("entry-only");
  });

  it("explains why it did not restate it", () => {
    expect(describePnlSource(out.pnlSource)).toContain("currency move");
  });

  it("does the same when there is no mark price to work from", () => {
    const noMark = applyEntryOverride({ ...PLAIN, markPrice: null }, 90);
    expect(noMark.pnlSource).toBe("entry-only");
    expect(noMark.entryPrice).toBe(90);
  });
});

/**
 * An override equal to the venue's own entry is still an override: it says you
 * checked. The P&L it produces must match what the venue said, or the
 * arithmetic was never understood in the first place.
 */
describe("an override that agrees with the venue", () => {
  it("reproduces the venue's own figure", () => {
    const same = applyEntryOverride(PLAIN, 100);
    expect(same.unrealizedPnl).toBe(PLAIN.unrealizedPnl);
    expect(same.pnlSource).toBe("yours");
  });
});

/**
 * A spot balance is the easy case: no leverage, no funding, no entry-date
 * exchange rate hidden in a figure. Value minus cost is the whole result, so an
 * entry you set restates it exactly — which is why this needs none of the
 * proving that an open position does.
 */
describe("what a spot balance cost", () => {
  it("multiplies your per-unit entry out over what you hold", () => {
    // HYPE: 1.11598249 units. The venue says 81.74 in total, 73.2449 a unit.
    expect(spotCostBasis(1.11598249, 81.74, 70)).toBe(78.12);
  });

  it("uses the venue's total when you have said nothing", () => {
    expect(spotCostBasis(1.11598249, 81.74, null)).toBe(81.74);
  });

  /**
   * A cost nobody stated is not a cost of nothing — `value − 0` reports the
   * whole holding as profit, which is how a stablecoin balance once showed a
   * gain equal to itself.
   */
  it("reports no cost rather than zero when neither says", () => {
    expect(spotCostBasis(82.02, null, null)).toBeNull();
  });

  it("lets your entry answer where the venue would not", () => {
    expect(spotCostBasis(10, null, 2.5)).toBe(25);
  });
});

describe("what the venue said a unit cost", () => {
  it("divides its total by what is held", () => {
    expect(venueEntryPerUnit(1.11598249, 81.74)).toBeCloseTo(73.2449, 4);
  });

  it("has no answer when the venue stated no cost", () => {
    expect(venueEntryPerUnit(82.02, null)).toBeNull();
  });

  /** Dividing by an empty balance would render an infinity as a price. */
  it("has no answer when nothing is held", () => {
    expect(venueEntryPerUnit(0, 81.74)).toBeNull();
  });
});

/**
 * Hyperliquid, September 2026: 1.116 HYPE on spot with its entry set to 32.21,
 * and a 10x long of 1.8 HYPE opened at 82.471 on the same connection. Both
 * read their entry from one row.
 */
describe("which entry applies to a spot balance and which to a position", () => {
  const HYPE = { entryPriceOverride: "32.21000000", positionEntryPriceOverride: null };
  const LONG = { size: 1.8, entryPrice: 82.471, markPrice: 93.228, unrealizedPnl: 19.3626, side: "long" };

  it("keeps the spot entry off an open position on the same coin", () => {
    expect(entryOverrideFor(HYPE, "position")).toBeNull();
    const out = applyEntryOverride(LONG, entryOverrideFor(HYPE, "position"));
    expect(out.unrealizedPnl).toBe(19.3626);
    expect(out.pnlSource).toBe("venue");
  });

  /** What the screen showed while the two shared a field. */
  it("would have recomputed the long from the spot entry", () => {
    expect(applyEntryOverride(LONG, 32.21).unrealizedPnl).toBe(109.83);
  });

  it("still gives the spot balance its own entry", () => {
    expect(entryOverrideFor(HYPE, "balance")).toBe(32.21);
    expect(spotCostBasis(1.11598249, 81.74, entryOverrideFor(HYPE, "balance"))).toBe(35.95);
  });

  it("gives a position its own entry when one is set", () => {
    const both = { ...HYPE, positionEntryPriceOverride: "80" };
    expect(entryOverrideFor(both, "position")).toBe(80);
    expect(entryOverrideFor(both, "balance")).toBe(32.21);
  });

  it("has no entry where no tags were ever saved", () => {
    expect(entryOverrideFor(undefined, "position")).toBeNull();
    expect(entryOverrideFor(null, "balance")).toBeNull();
  });

  /** A zero is not a price; `value − 0` would report the holding as profit. */
  it("ignores a stored zero rather than treating it as free", () => {
    expect(entryOverrideFor({ entryPriceOverride: "0", positionEntryPriceOverride: 0 }, "balance")).toBeNull();
    expect(entryOverrideFor({ entryPriceOverride: "0", positionEntryPriceOverride: 0 }, "position")).toBeNull();
  });
});
