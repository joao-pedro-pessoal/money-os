/**
 * Choosing what a chart shows: how far back, and at what resolution.
 *
 * Two separate questions that get confused constantly. "Last 3 months" is a
 * range; "weekly" is a bucket size. You want both — three months of daily
 * points is noise, three months of monthly points is three dots.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export type Bucket = "D" | "3D" | "W" | "M";

export const BUCKETS: { value: Bucket; label: string; days: number }[] = [
  { value: "D", label: "Daily", days: 1 },
  { value: "3D", label: "3 days", days: 3 },
  { value: "W", label: "Weekly", days: 7 },
  { value: "M", label: "Monthly", days: 30 },
];

export type RangeKey = "7d" | "1m" | "3m" | "6m" | "1y" | "all" | "custom";

export const RANGES: { value: RangeKey; label: string; days: number | null }[] = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "1m", label: "1 month", days: 30 },
  { value: "3m", label: "3 months", days: 90 },
  { value: "6m", label: "6 months", days: 180 },
  { value: "1y", label: "1 year", days: 365 },
  { value: "all", label: "All", days: null },
  { value: "custom", label: "Custom", days: null },
];

export function isBucket(v: string): v is Bucket {
  return BUCKETS.some((b) => b.value === v);
}

export function isRange(v: string): v is RangeKey {
  return RANGES.some((r) => r.value === v);
}

export interface Point {
  date: string;
  value: number;
}

/** Days between two YYYY-MM-DD strings, calendar-safe. */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

function shiftDays(date: string, days: number): string {
  const d = new Date(
    Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + days * 86_400_000
  );
  return d.toISOString().slice(0, 10);
}

export interface Window {
  from: string | null;
  to: string | null;
}

/**
 * Trims a series to a range, measured back from its own last point.
 *
 * Measured from the data, not from today: a chart of a portfolio you last
 * synced a week ago should still show something for "7 days".
 */
export function applyRange(series: Point[], range: RangeKey, custom?: Window): Point[] {
  if (series.length === 0) return [];
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));

  if (range === "custom") {
    return sorted.filter(
      (p) => (!custom?.from || p.date >= custom.from) && (!custom?.to || p.date <= custom.to)
    );
  }

  const days = RANGES.find((r) => r.value === range)?.days ?? null;
  if (days === null) return sorted;

  const cutoff = shiftDays(sorted[sorted.length - 1].date, -days);
  return sorted.filter((p) => p.date >= cutoff);
}

/**
 * Groups a daily series into buckets, keeping the LAST value in each.
 *
 * Last, not average: this is a balance, and the balance at the end of a week
 * is a real number that existed. An average of daily balances is a figure you
 * never had, and the chart would show a line that was never true.
 *
 * Buckets are counted back from the most recent point, so the newest bucket is
 * always complete at its right edge and the ragged one is the oldest — you
 * care about now, not about the tidiness of a year ago.
 */
export function resample(series: Point[], bucket: Bucket): Point[] {
  if (series.length === 0) return [];
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  if (bucket === "D") return sorted;

  if (bucket === "M") {
    const byMonth = new Map<string, Point>();
    // Later points overwrite earlier ones in the same month, leaving the last.
    for (const p of sorted) byMonth.set(p.date.slice(0, 7), p);
    return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  const size = BUCKETS.find((b) => b.value === bucket)!.days;
  const last = sorted[sorted.length - 1].date;

  const byBucket = new Map<number, Point>();
  for (const p of sorted) {
    // Distance back from the newest point, so the newest bucket is index 0.
    const index = Math.floor(daysBetween(p.date, last) / size);
    const existing = byBucket.get(index);
    if (!existing || p.date > existing.date) byBucket.set(index, p);
  }

  return [...byBucket.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface View {
  bucket: Bucket;
  range: RangeKey;
  custom?: Window;
}

export function applyView(series: Point[], view: View): Point[] {
  return resample(applyRange(series, view.range, view.custom), view.bucket);
}

/**
 * Change across whatever the chart is currently showing.
 *
 * Reported against the visible window rather than all history, because that's
 * the question the range picker was used to ask.
 */
export function changeOver(series: Point[]): {
  from: number;
  to: number;
  change: number;
  percent: number | null;
} | null {
  if (series.length < 2) return null;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const from = sorted[0].value;
  const to = sorted[sorted.length - 1].value;
  const change = round2(to - from);
  return {
    from: round2(from),
    to: round2(to),
    change,
    percent: from === 0 ? null : round2((change / Math.abs(from)) * 100),
  };
}

/**
 * A bucket size that suits the range, for the first render.
 *
 * A year of daily points is 365 dots on a chart 600 pixels wide.
 */
export function suggestBucket(range: RangeKey): Bucket {
  switch (range) {
    case "7d":
    case "1m":
      return "D";
    case "3m":
      return "3D";
    case "6m":
      return "W";
    default:
      return "M";
  }
}
