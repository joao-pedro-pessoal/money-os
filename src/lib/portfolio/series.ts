/**
 * The portfolio's value over time.
 *
 * Snapshots are per position, not per portfolio, so a chart has to reassemble
 * the total for each date. The obvious way — take each position's last known
 * value and add them up — is wrong in a way that only shows up after a few
 * months, and it is the bug this file exists to fix:
 *
 *   **A position you closed keeps its last snapshot forever.** Carried forward
 *   without a rule for when it stops, every position that ever existed goes on
 *   contributing its final value to every later date. The line climbs steadily
 *   while the real portfolio does nothing, and a €260 account is drawn as
 *   €1,000. Every closed position is a permanent, invisible addition.
 *
 * The rule here: a position contributes only until the connection is synced
 * *without* it. A sync that saw the account and didn't report the position is
 * the account saying it's gone — which is exactly the signal that was being
 * ignored. Nothing is inferred from time passing; only from a sync that
 * happened.
 *
 * Manual holdings are different and are carried forward indefinitely: they are
 * rows you maintain, and their absence from a snapshot means you didn't update
 * them, not that they vanished.
 *
 * Pure — no DB, no network.
 */

export interface SnapshotPoint {
  /** ISO day, `2026-08-16`. */
  date: string;
  value: number;
}

export interface SyncedSeriesInput {
  /** Keyed by `connectionId:coin`. */
  key: string;
  connectionId: string;
  points: SnapshotPoint[];
}

export interface SeriesPoint {
  date: string;
  portfolioValue: number;
}

/** The last point on or before `date`, or null when there is none. */
function lastAtOrBefore(points: readonly SnapshotPoint[], date: string): SnapshotPoint | null {
  let found: SnapshotPoint | null = null;
  for (const p of points) {
    if (p.date <= date) found = p;
    else break;
  }
  return found;
}

/**
 * Was this position still there on this date?
 *
 * True when nothing contradicts it. It is contradicted by a sync of the same
 * connection, after the position's last snapshot and no later than the date in
 * question, that didn't include it.
 */
export function stillHeld(
  lastSeen: string,
  date: string,
  connectionSyncDates: readonly string[]
): boolean {
  return !connectionSyncDates.some((d) => d > lastSeen && d <= date);
}

/**
 * Builds the series.
 *
 * `dates` is every day worth plotting; `manual` and `synced` are each
 * position's snapshots, already sorted ascending and converted to one currency.
 */
export function buildPortfolioSeries(input: {
  dates: readonly string[];
  manual: readonly SnapshotPoint[][];
  synced: readonly SyncedSeriesInput[];
}): SeriesPoint[] {
  // When each connection was synced, from the snapshots it produced.
  const syncDates = new Map<string, string[]>();
  for (const s of input.synced) {
    const known = syncDates.get(s.connectionId) ?? [];
    for (const p of s.points) if (!known.includes(p.date)) known.push(p.date);
    syncDates.set(s.connectionId, known);
  }
  for (const list of syncDates.values()) list.sort();

  return [...input.dates].sort().map((date) => {
    let total = 0;

    for (const points of input.manual) {
      total += lastAtOrBefore(points, date)?.value ?? 0;
    }

    for (const s of input.synced) {
      const seen = lastAtOrBefore(s.points, date);
      if (seen === null) continue;
      if (!stillHeld(seen.date, date, syncDates.get(s.connectionId) ?? [])) continue;
      total += seen.value;
    }

    return { date, portfolioValue: Math.round((total + Number.EPSILON) * 100) / 100 };
  });
}

export interface SeriesChange {
  absolute: number;
  /**
   * Null when there is nothing to measure against.
   *
   * A series that starts at zero — which every portfolio does, before it holds
   * anything — has no percentage change. Dividing by it produced "11248%",
   * a number that says only that the first point was near zero.
   */
  percent: number | null;
}

/** How much the series moved from its first point to its last. */
export function seriesChange(points: readonly SeriesPoint[]): SeriesChange {
  if (points.length < 2) return { absolute: 0, percent: null };

  const first = points[0].portfolioValue;
  const last = points[points.length - 1].portfolioValue;
  const absolute = Math.round((last - first + Number.EPSILON) * 100) / 100;

  // A baseline under a cent is indistinguishable from zero for this purpose,
  // and dividing by it produces a number with no meaning.
  if (Math.abs(first) < 0.01) return { absolute, percent: null };

  return {
    absolute,
    percent: Math.round(((last - first) / Math.abs(first)) * 10000) / 100,
  };
}

/**
 * Drops the empty run at the start.
 *
 * A chart that opens with a week of zeros — the days before you held anything —
 * spends most of its width on nothing and makes every later move look vertical.
 * The leading zeros are true, they just aren't worth drawing.
 */
export function trimLeadingZeros(points: readonly SeriesPoint[]): SeriesPoint[] {
  const firstReal = points.findIndex((p) => Math.abs(p.portfolioValue) >= 0.01);
  if (firstReal <= 0) return [...points];
  // Keeps one zero, so the rise out of nothing is still visible.
  return points.slice(firstReal - 1);
}
