/**
 * A converted amount is only true at the moment it was converted.
 *
 * The bug this fixes: every chart converted the whole history at *today's*
 * rate. A snapshot of $100 taken in March was drawn as €92 because that's what
 * $100 is worth today — not because that's what it was worth in March. With a
 * dollar-denominated account, every point on the net-worth line except the last
 * one was wrong, and nothing said so.
 *
 * The rule: conversion happens once, when the snapshot is written, and the
 * result is stored along with the rate that produced it. Refreshing rates
 * afterwards changes what things are worth *now*. It must never change what
 * they were worth then.
 */

export interface StoredConversion {
  /** The amount as the account holds it. */
  originalValue: number;
  originalCurrency: string;
  /** Units of base per 1 unit of originalCurrency, at the time of the snapshot. */
  rate: number | null;
  rateSource: string | null;
  /** When that rate was fetched — not when the snapshot was taken. */
  rateDate: Date | null;
  /** originalValue × rate, frozen. Null when no rate existed. */
  valueInBase: number | null;
  baseCurrency: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Freezes a conversion for storage.
 *
 * A missing rate produces `valueInBase: null`, not zero. Zero would quietly
 * drag the chart to the floor and look like you lost the money.
 */
export function freezeConversion(input: {
  value: number;
  currency: string;
  baseCurrency: string;
  rate: number | null;
  rateSource?: string | null;
  rateDate?: Date | null;
}): StoredConversion {
  const sameCurrency = input.currency === input.baseCurrency;
  // No conversion needed, and no rate should be invented for the identity case.
  const rate = sameCurrency ? 1 : input.rate;

  return {
    originalValue: round2(input.value),
    originalCurrency: input.currency,
    rate,
    rateSource: sameCurrency ? "identity" : (input.rateSource ?? null),
    rateDate: sameCurrency ? null : (input.rateDate ?? null),
    valueInBase: rate === null ? null : round2(input.value * rate),
    baseCurrency: input.baseCurrency,
  };
}

export interface SnapshotRow {
  accountId: string;
  timestamp: Date;
  balance: number;
  currency: string | null;
  valueInBase: string | number | null;
  rate: string | number | null;
  baseCurrency: string | null;
  /** True for rows written before conversions were frozen. */
  backfilled: boolean;
}

export interface SeriesPoint {
  date: string;
  value: number;
  /** True when this point rests on a rate that wasn't the rate of the day. */
  approximate: boolean;
}

/** One snapshot resolved to a base-currency figure, or null if unvaluable. */
function valueOf(
  r: SnapshotRow,
  todayRate: (currency: string) => number | null
): { value: number; approximate: boolean } | null {
  if (!r.backfilled && r.valueInBase !== null) {
    // The honest path: converted when it happened, at the rate of the day.
    return { value: Number(r.valueInBase), approximate: false };
  }
  // Written before conversions were frozen. Converting at today's rate is the
  // old, wrong behaviour — but dropping the row loses real history. So it's
  // converted and flagged, and the chart says how much of it is guesswork.
  const currency = r.currency ?? r.baseCurrency;
  const rate = currency ? todayRate(currency) : null;
  if (rate === null) return null;
  return { value: round2(r.balance * rate), approximate: true };
}

/**
 * Builds the net-worth series from sparse per-account snapshots.
 *
 * Snapshots only exist on the days a balance changed, so each account's last
 * known value is carried forward. Without that, a day where only one account
 * was touched would show the net worth of that account alone.
 */
export function seriesFromSnapshots(
  rows: SnapshotRow[],
  todayRate: (currency: string) => number | null
): SeriesPoint[] {
  const dayOf = (d: Date) => d.toISOString().slice(0, 10);

  // Latest snapshot per account per day — updating a balance twice in one day
  // means the second value replaced the first, it didn't add to it.
  const perAccount = new Map<string, Map<string, { value: number; approximate: boolean }>>();
  // Only days that produced a real figure. A row nobody can value must not
  // contribute a date, or the chart draws a point at zero for it and it reads
  // as the money having disappeared.
  const valuedDays = new Set<string>();

  for (const r of [...rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
    const resolved = valueOf(r, todayRate);
    if (resolved === null) continue;
    const day = dayOf(r.timestamp);
    if (!perAccount.has(r.accountId)) perAccount.set(r.accountId, new Map());
    perAccount.get(r.accountId)!.set(day, resolved);
    valuedDays.add(day);
  }

  const dates = [...valuedDays].sort();

  return dates.map((date) => {
    let value = 0;
    let approximate = false;

    for (const days of perAccount.values()) {
      const known = [...days.entries()].filter(([d]) => d <= date).sort(([a], [b]) => a.localeCompare(b));
      const last = known[known.length - 1];
      if (!last) continue;
      value += last[1].value;
      // One approximate account makes the whole day's total approximate.
      approximate = approximate || last[1].approximate;
    }

    return { date, value: round2(value), approximate };
  });
}

/** How much of the series rests on a rate that wasn't the rate of the day. */
export function approximateCount(series: SeriesPoint[]): number {
  return series.filter((p) => p.approximate).length;
}
