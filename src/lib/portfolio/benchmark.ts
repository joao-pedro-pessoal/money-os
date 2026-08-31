/**
 * What the market did, over exactly the window your own return covers.
 *
 * A return with nothing beside it says very little: +3,5% is good or bad
 * depending entirely on what everything else did in the same months. This is
 * the other half of `returns.ts`.
 *
 * Two rules decide everything in this file.
 *
 * **Only a time-weighted line may be compared to an index.** Net worth rises
 * when you pay money in, and an index has no equivalent event, so drawing the
 * two together compares a return against a return plus your salary — a deposit
 * would render as beating the market on the day it landed. The portfolio side
 * of this comparison is always `timeWeightedSeries`.
 *
 * **The windows must be the same window.** An index measured over a longer
 * period than the portfolio is not a comparison, it is two facts placed near
 * each other. Where the index series does not reach, this refuses rather than
 * quietly comparing eleven months against nine.
 *
 * Pure — no I/O. The fetching belongs to `actions/`.
 */

import type { ValuePoint } from "./returns";

export interface BenchmarkDefinition {
  /** Stable key, stored in settings. */
  id: string;
  /** What it is called on screen. */
  name: string;
  /** The Yahoo symbol actually priced. Shown to the user so it can be checked. */
  symbol: string;
  /** The currency that symbol trades in. */
  currency: string;
  /** Why this listing and not another. */
  note: string;
}

/**
 * The proxies, hand-written, and every entry **accumulating**.
 *
 * There is no free price series for "the S&P 500 including dividends", but
 * there is one for an ETF that tracks it — and the share class matters more
 * than the index does. An accumulating fund reinvests its dividends inside the
 * fund, so its price *is* a total-return series. A distributing fund's price
 * drops on every ex-dividend date, and comparing a portfolio that keeps its
 * dividends against a line that sheds them would understate the index by
 * roughly its yield every year, for ever. About two points a year on a world
 * tracker: small enough to look plausible, large enough to reverse the verdict.
 *
 * Each is quoted in EUR on Xetra, which keeps the comparison in the same money
 * as the portfolio without a historical FX series — which this app does not
 * keep, and would have to invent to convert a dollar-quoted index day by day.
 *
 * A wrong entry here is not a failed lookup, it is a silently wrong comparison,
 * so the UI names the symbol it priced. Same reasoning as `knownListings.ts`:
 * a hand-checked table, with the check visible.
 */
export const BENCHMARKS: readonly BenchmarkDefinition[] = [
  {
    id: "sp500",
    name: "S&P 500",
    symbol: "SXR8.DE",
    currency: "EUR",
    note: "iShares Core S&P 500 UCITS ETF, accumulating, Xetra listing in EUR.",
  },
  {
    id: "world",
    name: "MSCI World",
    symbol: "EUNL.DE",
    currency: "EUR",
    note: "iShares Core MSCI World UCITS ETF, accumulating, Xetra listing in EUR.",
  },
];

export function benchmarkById(id: string): BenchmarkDefinition | null {
  return BENCHMARKS.find((b) => b.id === id) ?? null;
}

/**
 * How far the index's nearest reading may sit from the window's edge.
 *
 * An index trades on weekdays and the portfolio's history starts whenever the
 * accounts were connected, which can be a Saturday. Seven days covers a long
 * weekend against a public holiday without covering a series that genuinely
 * does not reach back — the distinction being the whole point of the guard.
 */
export const MAX_ALIGNMENT_GAP_DAYS = 7;

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type BenchmarkRefusal =
  /** The index series has fewer than two readings inside the window. */
  | "no_series"
  /** The index does not reach back to where the portfolio's history starts. */
  | "starts_too_late"
  /** The index stops well before the portfolio's history ends. */
  | "ends_too_early"
  /** The series came back in a currency the comparison cannot use. */
  | "wrong_currency";

export interface BenchmarkComparison {
  /** The index rebased to 100 on the first aligned day, ready to plot. */
  curve: ValuePoint[];
  /** The index's total return across the window, as a fraction. */
  indexReturn: number;
  /** The window actually compared — the index's own first and last readings. */
  from: string;
  to: string;
}

/**
 * The index over one window, rebased to 100, or a stated reason why not.
 *
 * `from` and `to` come from `timeWeightedReturn`, which reports the window it
 * actually measured rather than the window it was asked about. Passing those
 * through is what keeps the two sides describing the same months.
 */
export function compareOverWindow(input: {
  points: readonly { date: string; close: number }[];
  currency: string | null;
  expectedCurrency: string;
  from: string;
  to: string;
}): { ok: true; comparison: BenchmarkComparison } | { ok: false; reason: BenchmarkRefusal } {
  /**
   * An unlabelled series is refused, not assumed.
   *
   * The same rule the quote pipeline learned the hard way: a number with no
   * currency beside it is the one case where being wrong is undetectable, so it
   * gets the strictest test rather than the loosest.
   */
  if (input.currency === null || input.currency.toUpperCase() !== input.expectedCurrency.toUpperCase()) {
    return { ok: false, reason: "wrong_currency" };
  }

  const inside = [...input.points]
    .filter((p) => p.date >= input.from && p.date <= input.to)
    .filter((p) => Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (inside.length < 2) return { ok: false, reason: "no_series" };

  const first = inside[0];
  const last = inside[inside.length - 1];

  if (daysApart(first.date, input.from) > MAX_ALIGNMENT_GAP_DAYS) {
    return { ok: false, reason: "starts_too_late" };
  }
  if (daysApart(last.date, input.to) > MAX_ALIGNMENT_GAP_DAYS) {
    return { ok: false, reason: "ends_too_early" };
  }

  const base = first.close;
  return {
    ok: true,
    comparison: {
      curve: inside.map((p) => ({ date: p.date, value: round2((p.close / base) * 100) })),
      indexReturn: last.close / base - 1,
      from: first.date,
      to: last.date,
    },
  };
}

/**
 * Ahead or behind, in percentage points.
 *
 * Subtraction and not a ratio: "+3,5% against +7,2%" is a gap of 3,7 points,
 * and calling it "51% of the market's return" invites reading a shortfall as a
 * performance figure of its own.
 */
export function relativeToBenchmark(portfolioReturn: number, indexReturn: number): number {
  return round2((portfolioReturn - indexReturn) * 100);
}
