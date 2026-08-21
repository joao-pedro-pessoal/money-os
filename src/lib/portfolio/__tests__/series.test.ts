import { describe, it, expect } from "vitest";
import {
  buildPortfolioSeries,
  seriesChange,
  stillHeld,
  trimLeadingZeros,
} from "../series";

const p = (date: string, value: number) => ({ date, value });

describe("a position that was closed", () => {
  it("stops counting once a sync happens without it", () => {
    // The bug: carried forward with no stopping rule, a closed position adds
    // its final value to every later date forever. Three months of that turns
    // a €200 account into a €1,000 line.
    const series = buildPortfolioSeries({
      dates: ["2026-08-01", "2026-08-02", "2026-08-03"],
      manual: [],
      synced: [
        { key: "c1:SOLD", connectionId: "c1", points: [p("2026-08-01", 500)] },
        {
          key: "c1:HELD",
          connectionId: "c1",
          points: [p("2026-08-01", 100), p("2026-08-02", 100), p("2026-08-03", 100)],
        },
      ],
    });

    expect(series.map((s) => s.portfolioValue)).toEqual([600, 100, 100]);
  });

  it("keeps counting while no sync has contradicted it", () => {
    // Between syncs the last known value is the best available answer.
    const series = buildPortfolioSeries({
      dates: ["2026-08-01", "2026-08-02", "2026-08-03"],
      manual: [],
      synced: [{ key: "c1:X", connectionId: "c1", points: [p("2026-08-01", 50), p("2026-08-03", 60)] }],
    });
    expect(series.map((s) => s.portfolioValue)).toEqual([50, 50, 60]);
  });

  it("only listens to syncs of its own connection", () => {
    // Another platform syncing says nothing about this one's positions.
    const series = buildPortfolioSeries({
      dates: ["2026-08-01", "2026-08-02"],
      manual: [],
      synced: [
        { key: "c1:X", connectionId: "c1", points: [p("2026-08-01", 100)] },
        { key: "c2:Y", connectionId: "c2", points: [p("2026-08-01", 10), p("2026-08-02", 10)] },
      ],
    });
    expect(series.map((s) => s.portfolioValue)).toEqual([110, 110]);
  });

  it("contributes nothing before its first snapshot", () => {
    const series = buildPortfolioSeries({
      dates: ["2026-08-01", "2026-08-02"],
      manual: [],
      synced: [{ key: "c1:X", connectionId: "c1", points: [p("2026-08-02", 40)] }],
    });
    expect(series.map((s) => s.portfolioValue)).toEqual([0, 40]);
  });

  it("handles a position closed and later reopened", () => {
    const series = buildPortfolioSeries({
      dates: ["2026-08-01", "2026-08-02", "2026-08-03"],
      manual: [],
      synced: [
        { key: "c1:X", connectionId: "c1", points: [p("2026-08-01", 100), p("2026-08-03", 120)] },
        { key: "c1:OTHER", connectionId: "c1", points: [p("2026-08-02", 5)] },
      ],
    });
    // Day 2: the sync saw OTHER but not X, so X is gone. Day 3: X is back.
    expect(series.map((s) => s.portfolioValue)).toEqual([100, 5, 120]);
  });
});

describe("deciding whether a position is still held", () => {
  it("is held when no sync has happened since it was last seen", () => {
    expect(stillHeld("2026-08-01", "2026-08-05", ["2026-08-01"])).toBe(true);
  });

  it("is gone once a later sync didn't report it", () => {
    expect(stillHeld("2026-08-01", "2026-08-05", ["2026-08-01", "2026-08-03"])).toBe(false);
  });

  it("ignores syncs after the date being asked about", () => {
    // Yesterday's chart point must not be rewritten by what happens tomorrow.
    expect(stillHeld("2026-08-01", "2026-08-02", ["2026-08-01", "2026-08-09"])).toBe(true);
  });

  it("is held on the very day it was seen", () => {
    expect(stillHeld("2026-08-03", "2026-08-03", ["2026-08-03"])).toBe(true);
  });
});

describe("manual holdings", () => {
  it("carries forward indefinitely, because they don't vanish", () => {
    // A holding missing from a snapshot means you didn't update it, not that
    // you sold it. Applying the sync rule here would erase your own records.
    const series = buildPortfolioSeries({
      dates: ["2026-08-01", "2026-08-02", "2026-08-03"],
      manual: [[p("2026-08-01", 250)]],
      synced: [{ key: "c1:X", connectionId: "c1", points: [p("2026-08-02", 10), p("2026-08-03", 10)] }],
    });
    expect(series.map((s) => s.portfolioValue)).toEqual([250, 260, 260]);
  });

  it("adds several holdings together", () => {
    const series = buildPortfolioSeries({
      dates: ["2026-08-01"],
      manual: [[p("2026-08-01", 100)], [p("2026-08-01", 50)]],
      synced: [],
    });
    expect(series[0].portfolioValue).toBe(150);
  });
});

describe("the series as a whole", () => {
  it("comes back in date order however the dates arrive", () => {
    const series = buildPortfolioSeries({
      dates: ["2026-08-03", "2026-08-01", "2026-08-02"],
      manual: [[p("2026-08-01", 10)]],
      synced: [],
    });
    expect(series.map((s) => s.date)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  it("is empty for an empty portfolio", () => {
    expect(buildPortfolioSeries({ dates: [], manual: [], synced: [] })).toEqual([]);
  });

  it("rounds to the cent", () => {
    const series = buildPortfolioSeries({
      dates: ["2026-08-01"],
      manual: [[p("2026-08-01", 0.1)], [p("2026-08-01", 0.2)]],
      synced: [],
    });
    expect(series[0].portfolioValue).toBe(0.3);
  });
});

describe("how much it moved", () => {
  const s = (values: number[]) =>
    values.map((v, i) => ({ date: `2026-08-0${i + 1}`, portfolioValue: v }));

  it("measures first to last", () => {
    expect(seriesChange(s([100, 150]))).toEqual({ absolute: 50, percent: 50 });
  });

  it("refuses a percentage when it started at nothing", () => {
    // This is where "11248%" came from: a first point of about zero. The
    // number described the baseline, not the portfolio.
    expect(seriesChange(s([0, 1010])).percent).toBeNull();
    expect(seriesChange(s([0, 1010])).absolute).toBe(1010);
    expect(seriesChange(s([0.004, 500])).percent).toBeNull();
  });

  it("reports a fall as negative", () => {
    expect(seriesChange(s([200, 150]))).toEqual({ absolute: -50, percent: -25 });
  });

  it("has nothing to say about a single point", () => {
    expect(seriesChange(s([100]))).toEqual({ absolute: 0, percent: null });
    expect(seriesChange([])).toEqual({ absolute: 0, percent: null });
  });
});

describe("trimming the empty start", () => {
  const s = (values: number[]) =>
    values.map((v, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, portfolioValue: v }));

  it("drops the days before anything was held, keeping one", () => {
    // Keeping one zero leaves the rise out of nothing visible.
    const trimmed = trimLeadingZeros(s([0, 0, 0, 100, 120]));
    expect(trimmed.map((x) => x.portfolioValue)).toEqual([0, 100, 120]);
  });

  it("leaves a series that starts with value alone", () => {
    expect(trimLeadingZeros(s([50, 60]))).toHaveLength(2);
  });

  it("leaves an all-zero series alone rather than emptying it", () => {
    expect(trimLeadingZeros(s([0, 0]))).toHaveLength(2);
  });
});
