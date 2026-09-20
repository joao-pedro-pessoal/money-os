/**
 * How a share price has moved, over windows the reader chooses.
 *
 * One weekly series per company, five years of it, and every window is
 * measured from that same series — a month, a quarter, half a year, a year,
 * three, five, and "since you bought". Asking the price source for each
 * window separately would be several requests per company and, worse, several
 * definitions of the same figure: this file is the only place a change in
 * price is computed.
 *
 * **A window the series does not reach back to has no answer.** A company
 * listed eighteen months ago has no five-year change; reporting the whole of
 * its life instead would label a 2-year rise as a 5-year one, which is the
 * kind of number that looks right and decides things.
 *
 * These are the company's own moves, never a return of yours: the shares
 * inside a fund were bought and sold by the fund all year. `changeSince` is
 * the one that comes closest, and it is still the market's move from a date,
 * not your gain.
 *
 * Pure: no fetch, no database.
 */

export interface PricePoint {
  /** Seconds since the epoch, as the source states it. */
  time: number;
  close: number;
}

export interface PriceSeries {
  currency: string | null;
  /** Oldest first, gaps dropped. */
  points: PricePoint[];
}

export const WINDOWS = [
  { key: "m1", label: "1 month", days: 30 },
  { key: "m3", label: "3 months", days: 91 },
  { key: "m6", label: "6 months", days: 182 },
  { key: "y1", label: "1 year", days: 365 },
  { key: "y3", label: "3 years", days: 1095 },
  { key: "y5", label: "5 years", days: 1825 },
] as const;

export type WindowKey = (typeof WINDOWS)[number]["key"];

export type PriceChanges = Partial<Record<WindowKey, number>>;

const DAY = 86_400;

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** The weekly series out of the price source's chart reply, or null. */
export function parsePriceSeries(payload: unknown): PriceSeries | null {
  const chart = (payload as { chart?: { result?: unknown[] } } | null)?.chart;
  const result = Array.isArray(chart?.result) ? (chart.result[0] as Record<string, unknown> | undefined) : undefined;
  if (!result) return null;
  const times = result.timestamp;
  const quote = (result.indicators as { quote?: Record<string, unknown>[] } | undefined)?.quote?.[0];
  const closes = quote?.close;
  if (!Array.isArray(times) || !Array.isArray(closes)) return null;

  const points: PricePoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    const close = closes[i];
    // A week the source has no close for is left out rather than carried
    // forward: a flat week that never happened moves every window through it.
    if (typeof time === "number" && Number.isFinite(time) && isFinitePositive(close)) {
      points.push({ time, close });
    }
  }
  if (points.length === 0) return null;
  points.sort((a, b) => a.time - b.time);
  const currency = (result.meta as { currency?: unknown } | undefined)?.currency;
  return { currency: typeof currency === "string" ? currency : null, points };
}

/**
 * The last close at or before a moment, or null when the series starts after
 * it. Never the closest point in either direction: a "5-year change" measured
 * from a listing's first day is not a five-year change.
 */
export function closeAt(series: PriceSeries, time: number): number | null {
  let found: number | null = null;
  for (const point of series.points) {
    if (point.time > time) break;
    found = point.close;
  }
  return found;
}

function percent(from: number, to: number): number {
  return Math.round(((to - from) / from) * 1000000) / 10000;
}

/**
 * Each window's move, in percent. A window the series does not cover is
 * absent from the result rather than present as zero.
 */
export function priceChanges(series: PriceSeries, now = Date.now()): PriceChanges {
  const last = series.points[series.points.length - 1];
  if (!last) return {};
  const nowSeconds = Math.floor(now / 1000);
  const changes: PriceChanges = {};
  for (const window of WINDOWS) {
    const at = nowSeconds - window.days * DAY;
    // The series has to start before the window does, or this is measuring
    // from the first day the company was listed and calling it five years.
    if (series.points[0].time > at) continue;
    const then = closeAt(series, at);
    if (then === null || then <= 0) continue;
    changes[window.key] = percent(then, last.close);
  }
  return changes;
}

/**
 * The move from a date you name — the day you bought, in practice.
 *
 * Null when the series does not reach back that far, which is the honest
 * answer for a company whose listing is younger than the holding: it is not
 * the same shares the fund held then.
 */
export function changeSince(series: PriceSeries, isoDate: string): number | null {
  const time = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(time)) return null;
  const seconds = Math.floor(time / 1000);
  if (series.points[0].time > seconds) return null;
  const then = closeAt(series, seconds);
  const last = series.points[series.points.length - 1];
  if (then === null || then <= 0 || !last) return null;
  return percent(then, last.close);
}
