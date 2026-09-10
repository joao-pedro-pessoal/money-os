import { describe, it, expect } from "vitest";
import {
  compareOverWindow,
  relativeToBenchmark,
  benchmarkById,
  BENCHMARKS,
  MAX_ALIGNMENT_GAP_DAYS,
} from "../benchmark";

/** A weekday series growing at a steady rate, for windows that need shape. */
function series(from: string, days: number, start: number, dailyGrowth: number) {
  const points: { date: string; close: number }[] = [];
  let close = start;
  const cursor = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < days; i += 1) {
    points.push({ date: cursor.toISOString().slice(0, 10), close: Math.round(close * 1e6) / 1e6 });
    close *= 1 + dailyGrowth;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

const base = {
  currency: "EUR",
  expectedCurrency: "EUR",
};

describe("comparing an index over the portfolio's own window", () => {
  it("rebases to 100 on the first aligned day", () => {
    const result = compareOverWindow({
      ...base,
      points: series("2026-01-01", 100, 400, 0.001),
      from: "2026-01-01",
      to: "2026-04-10",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.comparison.curve[0]).toEqual({ date: "2026-01-01", value: 100 });
  });

  it("measures the return between the two ends and nothing else", () => {
    const result = compareOverWindow({
      ...base,
      // 100 → 120 exactly.
      points: [
        { date: "2026-01-01", close: 100 },
        { date: "2026-06-01", close: 150 },
        { date: "2026-12-31", close: 120 },
      ],
      from: "2026-01-01",
      to: "2026-12-31",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The peak in the middle is on the curve but must not touch the return.
    expect(result.comparison.indexReturn).toBeCloseTo(0.2, 6);
    expect(result.comparison.curve[1].value).toBeCloseTo(150, 6);
  });

  it("ignores readings outside the window entirely", () => {
    const result = compareOverWindow({
      ...base,
      points: [
        { date: "2025-01-01", close: 50 }, // long before: must not become the base
        { date: "2026-01-02", close: 100 },
        { date: "2026-03-01", close: 110 },
        { date: "2027-01-01", close: 900 }, // long after
      ],
      from: "2026-01-01",
      to: "2026-03-01",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.comparison.from).toBe("2026-01-02");
    expect(result.comparison.to).toBe("2026-03-01");
    expect(result.comparison.indexReturn).toBeCloseTo(0.1, 6);
  });
});

/**
 * Every refusal here exists because the alternative is a number that looks like
 * an answer. Comparing nine months of portfolio against eleven of index is the
 * failure this file was written to prevent.
 */
describe("refusing rather than comparing unlike windows", () => {
  it("refuses a series that does not reach the start of the window", () => {
    const result = compareOverWindow({
      ...base,
      points: series("2026-06-01", 60, 100, 0.001),
      from: "2026-01-01",
      to: "2026-07-20",
    });

    expect(result).toEqual({ ok: false, reason: "starts_too_late" });
  });

  it("refuses a series that stops well before the window ends", () => {
    const result = compareOverWindow({
      ...base,
      points: series("2026-01-01", 30, 100, 0.001),
      from: "2026-01-01",
      to: "2026-12-31",
    });

    expect(result).toEqual({ ok: false, reason: "ends_too_early" });
  });

  /**
   * A weekend or a public holiday at the edge is ordinary and must not refuse:
   * the portfolio's history starts when the accounts were connected, which has
   * no reason to be a trading day.
   */
  it("accepts a gap of a long weekend at either edge", () => {
    const result = compareOverWindow({
      ...base,
      // Window opens on a Saturday; the index's first reading is the Monday.
      points: series("2026-01-05", 90, 100, 0.001),
      from: "2026-01-03",
      to: "2026-04-04",
    });

    expect(result.ok).toBe(true);
  });

  it("draws the line at the stated tolerance", () => {
    expect(MAX_ALIGNMENT_GAP_DAYS).toBe(7);

    const justOutside = compareOverWindow({
      ...base,
      points: series("2026-01-10", 90, 100, 0.001),
      from: "2026-01-01",
      to: "2026-04-09",
    });
    expect(justOutside).toEqual({ ok: false, reason: "starts_too_late" });
  });

  it("refuses a single reading, which is a price and not a return", () => {
    const result = compareOverWindow({
      ...base,
      points: [{ date: "2026-01-01", close: 100 }],
      from: "2026-01-01",
      to: "2026-01-02",
    });
    expect(result).toEqual({ ok: false, reason: "no_series" });
  });

  /**
   * The strictest rule, on the loosest-looking field. An unlabelled series is
   * the one case where being wrong leaves no trace: the shape is plausible,
   * the dates are right, and the whole comparison is off by an exchange rate.
   */
  it("refuses an unlabelled series rather than assuming the currency", () => {
    const result = compareOverWindow({
      points: series("2026-01-01", 90, 100, 0.001),
      currency: null,
      expectedCurrency: "EUR",
      from: "2026-01-01",
      to: "2026-04-01",
    });
    expect(result).toEqual({ ok: false, reason: "wrong_currency" });
  });

  it("refuses a series in the wrong currency instead of converting it", () => {
    const result = compareOverWindow({
      points: series("2026-01-01", 90, 100, 0.001),
      currency: "USD",
      expectedCurrency: "EUR",
      from: "2026-01-01",
      to: "2026-04-01",
    });
    expect(result).toEqual({ ok: false, reason: "wrong_currency" });
  });

  it("does not care how the currency was capitalised", () => {
    const result = compareOverWindow({
      points: series("2026-01-01", 90, 100, 0.001),
      currency: "eur",
      expectedCurrency: "EUR",
      from: "2026-01-01",
      to: "2026-04-01",
    });
    expect(result.ok).toBe(true);
  });

  it("skips a reading of zero rather than plotting a total loss", () => {
    const result = compareOverWindow({
      ...base,
      points: [
        { date: "2026-01-01", close: 100 },
        { date: "2026-02-01", close: 0 },
        { date: "2026-03-01", close: 110 },
      ],
      from: "2026-01-01",
      to: "2026-03-01",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.comparison.curve.map((p) => p.value)).toEqual([100, 110]);
  });
});

describe("ahead or behind", () => {
  it("reports the gap in percentage points, not as a ratio", () => {
    // +3.5% against +7.2% is 3.7 points behind.
    expect(relativeToBenchmark(0.035, 0.072)).toBeCloseTo(-3.7, 6);
  });

  it("is positive when the portfolio won", () => {
    expect(relativeToBenchmark(0.12, 0.05)).toBeCloseTo(7, 6);
  });

  it("handles a market that fell further than the portfolio did", () => {
    // Losing 4% while the index lost 10% is six points ahead.
    expect(relativeToBenchmark(-0.04, -0.1)).toBeCloseTo(6, 6);
  });
});

describe("the proxy table", () => {
  it("finds a benchmark by id and nothing by a wrong one", () => {
    expect(benchmarkById("sp500")?.symbol).toBe("SXR8.DE");
    expect(benchmarkById("nope")).toBeNull();
  });

  /**
   * The share class is the load-bearing part. A distributing fund's price sheds
   * its dividends, which would understate the index by its yield every year —
   * about two points on a world tracker, enough to reverse a verdict and small
   * enough to look right.
   */
  it("names an accumulating listing for every benchmark", () => {
    for (const b of BENCHMARKS) {
      expect(b.note.toLowerCase(), b.id).toContain("accumulating");
    }
  });

  it("quotes every benchmark in one currency the app can compare without an FX series", () => {
    for (const b of BENCHMARKS) {
      expect(b.currency, b.id).toBe("EUR");
    }
  });

  it("has unique ids, since settings store one", () => {
    expect(new Set(BENCHMARKS.map((b) => b.id)).size).toBe(BENCHMARKS.length);
  });
});
