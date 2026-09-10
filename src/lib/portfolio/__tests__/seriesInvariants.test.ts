import { describe, it, expect } from "vitest";
import { buildPortfolioSeries, seriesChange, trimLeadingZeros, stillHeld } from "../series";
import { seriesFromSnapshots, freezeConversion, type SnapshotRow } from "../../fx/historical";
import { inferRhythm, summariseByTicker, trailingYield } from "../dividends";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);

describe("the portfolio line", () => {
  it("is dated in order and never NaN, whatever it is given", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const dates = Array.from({ length: 20 }, (_, i) => day(i));

      const manual = Array.from({ length: Math.floor(r() * 3) }, () =>
        Array.from({ length: Math.floor(r() * 6) }, () => ({
          date: day(Math.floor(r() * 20)),
          value: r() * 500,
        })).sort((a, b) => a.date.localeCompare(b.date))
      );

      const synced = Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({
        key: `c${i}:X`,
        connectionId: `c${i}`,
        points: Array.from({ length: Math.floor(r() * 6) }, () => ({
          date: day(Math.floor(r() * 20)),
          value: r() * 500,
        })).sort((a, b) => a.date.localeCompare(b.date)),
      }));

      const series = buildPortfolioSeries({ dates, manual, synced });

      expect(series).toHaveLength(dates.length);
      for (let i = 1; i < series.length; i++) {
        expect(series[i].date >= series[i - 1].date).toBe(true);
      }
      for (const p of series) {
        expect(Number.isNaN(p.portfolioValue)).toBe(false);
        expect(Number.isFinite(p.portfolioValue)).toBe(true);
      }
    }
  });

  it("drops a position once a later sync of its own connection didn't mention it", () => {
    // The bug this was written for: a closed position kept its final snapshot
    // and was carried forward for ever, so the chart climbed while the account
    // stood still — 1010 € on an account holding 262 €.
    const series = buildPortfolioSeries({
      dates: [day(0), day(1), day(2)],
      manual: [],
      synced: [
        { key: "c1:BTC", connectionId: "c1", points: [{ date: day(0), value: 100 }] },
        { key: "c1:ETH", connectionId: "c1", points: [{ date: day(0), value: 50 }, { date: day(2), value: 60 }] },
      ],
    });

    expect(series[0].portfolioValue).toBe(150);
    // Day 2 syncs the connection without BTC: it has been closed.
    expect(series[2].portfolioValue).toBe(60);
  });

  it("keeps a position that no later sync has contradicted", () => {
    expect(stillHeld(day(0), day(5), [day(0)])).toBe(true);
    expect(stillHeld(day(0), day(5), [day(0), day(3)])).toBe(false);
    // A sync on the same day is not evidence of a later absence.
    expect(stillHeld(day(3), day(5), [day(3)])).toBe(true);
  });
});

describe("percentage change refuses a meaningless baseline", () => {
  it("returns null whenever the series starts at nothing", () => {
    for (const first of [0, 0.001, -0.004]) {
      const change = seriesChange([
        { date: day(0), portfolioValue: first },
        { date: day(1), portfolioValue: 500 },
      ]);
      // "+11248%" was this number, and it only ever said the first point was
      // near zero.
      expect(change.percent).toBeNull();
      expect(Number.isNaN(change.absolute)).toBe(false);
    }
  });

  it("measures a real baseline normally", () => {
    const change = seriesChange([
      { date: day(0), portfolioValue: 200 },
      { date: day(1), portfolioValue: 250 },
    ]);
    expect(change).toEqual({ absolute: 50, percent: 25 });
  });

  it("has nothing to say about a single point", () => {
    expect(seriesChange([{ date: day(0), portfolioValue: 100 }])).toEqual({
      absolute: 0,
      percent: null,
    });
    expect(seriesChange([])).toEqual({ absolute: 0, percent: null });
  });

  it("keeps one zero when trimming, so the rise out of nothing is visible", () => {
    const points = [0, 0, 0, 10, 20].map((v, i) => ({ date: day(i), portfolioValue: v }));
    const trimmed = trimLeadingZeros(points);

    expect(trimmed[0].portfolioValue).toBe(0);
    expect(trimmed).toHaveLength(3);
    // Nothing to trim leaves the series untouched.
    expect(trimLeadingZeros([{ date: day(0), portfolioValue: 5 }])).toHaveLength(1);
    expect(trimLeadingZeros([])).toEqual([]);
  });
});

describe("frozen conversions", () => {
  it("prefers the rate of the day over the rate of today", () => {
    // A converted figure is only true at the moment it was converted. Using
    // today's rate on an old row rewrites what things were worth then.
    const stored = freezeConversion({ value: 100, currency: "USD", rate: 0.9, baseCurrency: "EUR" });
    expect(stored.valueInBase).toBe(90);
    expect(stored.rate).toBe(0.9);

    // The identity case must not invent a rate for itself.
    const same = freezeConversion({ value: 100, currency: "EUR", rate: null, baseCurrency: "EUR" });
    expect(same.valueInBase).toBe(100);
    expect(same.rateSource).toBe("identity");

    // No rate means no value — never zero, which would read as money lost.
    const unknown = freezeConversion({ value: 100, currency: "JPY", rate: null, baseCurrency: "EUR" });
    expect(unknown.valueInBase).toBeNull();
  });

  it("marks a row it had to value at today's rate", () => {
    const rows: SnapshotRow[] = [
      {
        accountId: "a",
        timestamp: new Date("2026-01-01T12:00:00Z"),
        balance: 100,
        currency: "USD",
        valueInBase: null,
        rate: null,
        baseCurrency: "EUR",
        backfilled: true,
      },
    ];

    const series = seriesFromSnapshots(rows, () => 0.9);
    expect(series[0].approximate).toBe(true);
    expect(series[0].value).toBe(90);
  });

  it("leaves out a day it cannot value rather than drawing it as zero", () => {
    // A point at zero reads as the money having disappeared, which is a far
    // worse claim than a gap in the line.
    const rows: SnapshotRow[] = [
      {
        accountId: "a",
        timestamp: new Date("2026-01-01T12:00:00Z"),
        balance: 100,
        currency: "JPY",
        valueInBase: null,
        rate: null,
        baseCurrency: "EUR",
        backfilled: true,
      },
    ];

    expect(seriesFromSnapshots(rows, () => null)).toEqual([]);
  });

  it("carries each account forward and never double counts a day", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const rows: SnapshotRow[] = Array.from({ length: 20 }, () => ({
        accountId: `a${Math.floor(r() * 3)}`,
        timestamp: new Date(Date.UTC(2026, 0, 1 + Math.floor(r() * 10), 12)),
        balance: Math.round(r() * 1000),
        currency: "EUR",
        valueInBase: null,
        rate: null,
        baseCurrency: "EUR",
        backfilled: false,
      }));

      const series = seriesFromSnapshots(rows, () => 1);

      for (let i = 1; i < series.length; i++) {
        expect(series[i].date > series[i - 1].date).toBe(true);
      }
      for (const p of series) expect(Number.isNaN(p.value)).toBe(false);
    }
  });

  it("takes the last balance of a day, not the sum of that day's edits", () => {
    // Correcting a balance twice in one day means the second value replaced the
    // first. Adding them would report double the money.
    const rows: SnapshotRow[] = [
      { accountId: "a", timestamp: new Date("2026-01-01T09:00:00Z"), balance: 100, currency: "EUR", valueInBase: null, rate: null, baseCurrency: "EUR", backfilled: false },
      { accountId: "a", timestamp: new Date("2026-01-01T17:00:00Z"), balance: 250, currency: "EUR", valueInBase: null, rate: null, baseCurrency: "EUR", backfilled: false },
    ];

    const series = seriesFromSnapshots(rows, () => 1);
    expect(series).toHaveLength(1);
    expect(series[0].value).toBe(250);
  });
});

describe("dividend rhythm is inferred, never invented", () => {
  it("says nothing from a single payment", () => {
    const rhythm = inferRhythm([new Date("2026-01-15")]);
    // Null, not a guess. One payment is not a pattern.
    expect(rhythm.cadence).toBeNull();
    expect(rhythm.confidence).toBe("none");
    expect(rhythm.estimatedNext).toBeNull();
  });

  it("recognises a quarterly run", () => {
    const rhythm = inferRhythm([
      new Date("2025-03-15"),
      new Date("2025-06-15"),
      new Date("2025-09-15"),
      new Date("2025-12-15"),
    ]);
    expect(rhythm.cadence).toBe("quarterly");
  });

  it("never returns NaN for the median gap", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const count = Math.floor(r() * 8);
      const dates = Array.from(
        { length: count },
        () => new Date(Date.UTC(2025, Math.floor(r() * 12), 1 + Math.floor(r() * 28)))
      );

      const rhythm = inferRhythm(dates);
      if (rhythm.medianGapDays !== null) {
        expect(Number.isNaN(rhythm.medianGapDays)).toBe(false);
        expect(rhythm.medianGapDays).toBeGreaterThanOrEqual(0);
      }
      // An estimate without a basis is worse than no estimate.
      if (rhythm.confidence === "none") expect(rhythm.estimatedNext).toBeNull();
    }
  });

  it("gives no yield when there is nothing to divide by", () => {
    const paid = [
      { ticker: "A", paidOn: new Date(), amount: 50, currency: "EUR", type: null },
    ];

    // A yield on a position worth nothing is either infinite or meaningless,
    // and both would be rendered as a percentage someone might believe.
    expect(trailingYield(paid, 0)).toBeNull();
    expect(trailingYield(paid, -100)).toBeNull();
    expect(trailingYield(paid, null)).toBeNull();
    // Nothing received means no yield to report, not zero percent.
    expect(trailingYield([], 1000)).toBeNull();
  });

  it("groups payments without losing any", () => {
    const payments = [
      { ticker: "A", paidOn: new Date("2025-01-01"), amount: 10, currency: "EUR", type: null },
      { ticker: "A", paidOn: new Date("2025-04-01"), amount: 12, currency: "EUR", type: null },
      { ticker: "B", paidOn: new Date("2025-02-01"), amount: 5, currency: "EUR", type: null },
    ];

    const summary = summariseByTicker(payments);
    const total = summary.reduce((s, t) => s + t.total, 0);

    expect(total).toBe(27);
    expect(summary).toHaveLength(2);
  });
});
