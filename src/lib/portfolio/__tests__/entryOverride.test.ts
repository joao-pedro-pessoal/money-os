import { describe, it, expect } from "vitest";
import {
  applyEntryOverride,
  venuePnlIsReproducible,
  describePnlSource,
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
