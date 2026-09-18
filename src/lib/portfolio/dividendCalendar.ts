/**
 * When the next dividend comes, and what the next year might bring.
 *
 * Two kinds of date, never mixed up. An **announced** date is one the company
 * has published (Yahoo's calendar: the ex-dividend day and the payment day).
 * An **estimated** date is the rhythm of your own past payments carried
 * forward (`inferRhythm`). An announcement wins while it is still ahead; once
 * it has passed, the estimate takes over again — a stale announcement is not
 * a date.
 *
 * The forecast is what your still-held payers paid over the last twelve
 * months, and says so. It is not a promise: a company can cut, raise or stop.
 *
 * Pure: announced dates are read in actions/exposure, payments in
 * actions/dividends.
 */

import type { TickerSummary } from "./dividends";

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface Announced {
  /** YYYY-MM-DD: own the shares before this day to be paid. */
  exDividendDate: string | null;
  /** YYYY-MM-DD: the day it is paid. Often published later than the ex-date. */
  dividendDate: string | null;
}

export interface NextDividend {
  ticker: string;
  instrumentName: string | null;
  /** The payment day when known, else the ex-date, else the estimate. */
  date: Date;
  kind: "announced" | "estimated";
  /** Set when announced. */
  exDividendDate: string | null;
  /** Set when the payment day itself was announced. */
  payDateAnnounced: boolean;
  /** The estimate's confidence; null for an announcement. */
  confidence: "low" | "good" | null;
}

/** A Yahoo calendar date (epoch seconds, or {raw}) as YYYY-MM-DD, in UTC. */
export function calendarDay(value: unknown): string | null {
  const raw =
    typeof value === "number" ? value : value && typeof value === "object" ? (value as { raw?: unknown }).raw : null;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return new Date(raw * 1000).toISOString().slice(0, 10);
}

const dayStart = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * The next dividend for each paying instrument, soonest first.
 *
 * Interest-only tickers are left out: interest on cash is not a dividend and
 * has no calendar.
 */
export function upcomingDividends(
  summaries: readonly TickerSummary[],
  announced: ReadonlyMap<string, Announced>,
  now: Date = new Date()
): NextDividend[] {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const out: NextDividend[] = [];

  for (const s of summaries) {
    if (s.interestOnly) continue;
    const a = announced.get(s.ticker);
    const pay = a?.dividendDate && dayStart(a.dividendDate) >= today ? a.dividendDate : null;
    const ex = a?.exDividendDate && dayStart(a.exDividendDate) >= today ? a.exDividendDate : null;
    // The payment day is what "next dividend" means; the ex-date stands in
    // while the payment day is not yet published. Either one still ahead
    // counts — a payment is often two weeks after an ex-date that has passed.
    if (pay || ex) {
      out.push({
        ticker: s.ticker,
        instrumentName: s.instrumentName,
        date: dayStart(pay ?? ex!),
        kind: "announced",
        exDividendDate: a?.exDividendDate ?? null,
        payDateAnnounced: pay !== null,
        confidence: null,
      });
      continue;
    }
    const estimate = s.rhythm.estimatedNext;
    if (estimate && estimate > now && s.rhythm.confidence !== "none") {
      out.push({
        ticker: s.ticker,
        instrumentName: s.instrumentName,
        date: estimate,
        kind: "estimated",
        exDividendDate: null,
        payDateAnnounced: false,
        confidence: s.rhythm.confidence,
      });
    }
  }

  return out.sort((x, y) => x.date.getTime() - y.date.getTime());
}

export interface ForecastPayment {
  ticker: string;
  instrumentName: string | null;
  paidOn: Date;
  /** Already in the base currency. */
  amount: number;
}

export interface IncomeForecast {
  /** What the still-held payers paid over the last twelve months, base currency. */
  total: number;
  byTicker: { ticker: string; instrumentName: string | null; amount: number }[];
  /** Paid in the last twelve months by positions no longer held: left out. */
  leftOut: number;
}

/**
 * The next twelve months, if every position you still hold pays what it paid
 * over the last twelve. Positions sold since are left out, with their amount,
 * so the total is not inflated by income that has already stopped.
 */
export function incomeForecast(
  payments: readonly ForecastPayment[],
  held: ReadonlySet<string>,
  now: Date = new Date()
): IncomeForecast {
  const cutoff = now.getTime() - 365 * DAY_MS;
  const byTicker = new Map<string, { instrumentName: string | null; amount: number }>();
  let leftOut = 0;

  for (const p of payments) {
    const at = p.paidOn.getTime();
    if (at <= cutoff || at > now.getTime()) continue;
    if (!held.has(p.ticker)) {
      leftOut += p.amount;
      continue;
    }
    const e = byTicker.get(p.ticker) ?? { instrumentName: p.instrumentName, amount: 0 };
    e.amount += p.amount;
    byTicker.set(p.ticker, e);
  }

  const rows = [...byTicker]
    .map(([ticker, e]) => ({ ticker, instrumentName: e.instrumentName, amount: round2(e.amount) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  return { total: round2(rows.reduce((s, r) => s + r.amount, 0)), byTicker: rows, leftOut: round2(leftOut) };
}
