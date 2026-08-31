import { describe, it, expect } from "vitest";
import { compose, growth, valueAt, growthOverDays } from "../composition";

describe("compose", () => {
  it("separates what can fall from what cannot", () => {
    const c = compose([
      { value: 1000, floating: false },
      { value: 3000, floating: true },
    ]);
    expect(c.total).toBe(4000);
    expect(c.stable).toBe(1000);
    expect(c.floating).toBe(3000);
    expect(c.floatingPercent).toBe(75);
  });

  it("reports a fully stable account as such", () => {
    const c = compose([{ value: 500, floating: false }]);
    expect(c.floating).toBe(0);
    expect(c.floatingPercent).toBe(0);
  });

  it("has no percentage for an empty account", () => {
    expect(compose([]).floatingPercent).toBeNull();
  });

  it("carries the unrealised P&L through", () => {
    expect(compose([{ value: 3000, floating: true }], 240).unrealisedPnl).toBe(240);
  });
});

describe("growth", () => {
  it("measures a plain change", () => {
    const g = growth({ from: 1000, to: 1100 });
    expect(g.change).toBe(100);
    expect(g.percent).toBe(10);
  });

  it("refuses to call a deposit growth", () => {
    // 1 000 → 2 000 because you paid in 1 000 is growth of nothing. Calling it
    // 100% would be the flattering lie this app exists not to tell.
    const g = growth({ from: 1000, to: 2000, contributions: 1000 });
    expect(g.percent).toBe(100);
    expect(g.gain).toBe(0);
    expect(g.gainPercent).toBe(0);
  });

  it("credits real gain on top of a deposit", () => {
    const g = growth({ from: 1000, to: 2100, contributions: 1000 });
    expect(g.gain).toBe(100);
    // Measured against the money actually at work: 1 000 + 1 000.
    expect(g.gainPercent).toBe(5);
  });

  it("handles a withdrawal", () => {
    // Took out 500 and still ended 100 up: that's a 100 gain.
    const g = growth({ from: 1000, to: 600, contributions: -500 });
    expect(g.change).toBe(-400);
    expect(g.gain).toBe(100);
  });

  it("reports a loss as a loss", () => {
    const g = growth({ from: 1000, to: 800, contributions: 0 });
    expect(g.gain).toBe(-200);
    expect(g.gainPercent).toBe(-20);
  });

  it("says nothing about gain when contributions are unknown", () => {
    const g = growth({ from: 1000, to: 1100 });
    expect(g.gain).toBeNull();
    expect(g.gainPercent).toBeNull();
  });

  it("does not divide by zero from an empty start", () => {
    const g = growth({ from: 0, to: 500, contributions: 500 });
    expect(g.percent).toBeNull();
    expect(g.gain).toBe(0);
    expect(g.gainPercent).toBe(0);
  });
});

describe("valueAt", () => {
  const series = [
    { date: "2026-01-01", value: 100 },
    { date: "2026-03-01", value: 200 },
    { date: "2026-06-01", value: 300 },
  ];

  it("carries the last known value forward", () => {
    expect(valueAt(series, "2026-04-15")).toBe(200);
  });

  it("takes the exact point when one exists", () => {
    expect(valueAt(series, "2026-03-01")).toBe(200);
  });

  it("is null before the series starts", () => {
    expect(valueAt(series, "2025-12-31")).toBeNull();
  });
});

describe("growthOverDays", () => {
  const series = [
    { date: "2026-01-01", value: 1000 },
    { date: "2026-06-01", value: 1200 },
    { date: "2026-08-01", value: 1500 },
  ];

  it("measures back from the last point", () => {
    const g = growthOverDays(series, 90);
    expect(g?.to).toBe(1500);
  });

  it("refuses a window longer than the data", () => {
    // "Up 40% this year" from three weeks of history is a claim the data
    // cannot support.
    expect(growthOverDays(series, 3650)).toBeNull();
  });

  it("needs at least two points", () => {
    expect(growthOverDays([{ date: "2026-08-01", value: 100 }], 30)).toBeNull();
    expect(growthOverDays([], 30)).toBeNull();
  });

  it("passes contributions through", () => {
    const g = growthOverDays(series, 90, 200);
    expect(g?.gain).not.toBeNull();
  });
});

/**
 * A gain that leaves positions out must say so.
 *
 * Two market-exposed things cannot produce a P&L: a holding with no price yet,
 * and a synced exchange balance, which reports what it is worth and never what
 * it cost. Both used to contribute nothing while the total presented itself as
 * whole — the same shape as the twelve rows that once read `+0,00 €` on a
 * portfolio that was up.
 */
describe("what the P&L could not measure", () => {
  it("is zero when everything contributed", () => {
    expect(compose([{ value: 3000, floating: true }], 240).pnlUnmeasured).toBe(0);
  });

  it("is carried through rather than folded into the number", () => {
    const c = compose([{ value: 3000, floating: true }], 240, 2);
    // The gain is still 240 — of the part that could be measured.
    expect(c.unrealisedPnl).toBe(240);
    expect(c.pnlUnmeasured).toBe(2);
  });

  /**
   * The case that matters: nothing measurable at all. The gain is 0 and that 0
   * means "nobody measured", not "flat". A caller has to be able to tell the
   * two apart, which is what the count is for.
   */
  it("reports a count beside a zero, so the zero can be read as absence", () => {
    const c = compose([{ value: 500, floating: true }], 0, 1);
    expect(c.unrealisedPnl).toBe(0);
    expect(c.pnlUnmeasured).toBe(1);
  });

  it("leaves the value split untouched — an unmeasured position still has value", () => {
    const c = compose([{ value: 500, floating: true }], 0, 1);
    expect(c.floating).toBe(500);
    expect(c.total).toBe(500);
  });
});
