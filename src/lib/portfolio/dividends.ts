/**
 * Income that arrives without you selling anything.
 *
 * Two very different kinds of statement live in this file, and the difference
 * is the point:
 *
 *  - **What was paid.** Facts, straight from the platform's history. Amounts,
 *    dates, tickers. Nothing here is estimated.
 *  - **What is likely next.** Inferred from the pattern of those payments and
 *    labelled as inference everywhere it surfaces. No platform publishes a
 *    forward dividend calendar through its API, so the alternative to inferring
 *    was showing nothing — and "you've been paid every quarter for three years"
 *    is genuinely useful as long as it is never dressed up as an announcement.
 *
 * Pure — no DB, no network.
 */

export interface DividendPayment {
  ticker: string;
  instrumentName?: string | null;
  paidOn: Date;
  /** In the account's currency. */
  amount: number;
  currency: string;
  quantity?: number | null;
  grossPerShare?: number | null;
  /** The platform's own word: ORDINARY, INTEREST, CAPITAL_GAINS… */
  type?: string | null;
}

/**
 * Distributions that are interest on cash rather than income from an
 * instrument. Both are money you received; only one says anything about what
 * a holding yields, so the per-ticker view separates them.
 */
export function isInterest(type: string | null | undefined): boolean {
  if (!type) return false;
  return type.toUpperCase().startsWith("INTEREST");
}

/** A payment the platform made on someone else's behalf, not the issuer's. */
export function isManufactured(type: string | null | undefined): boolean {
  return Boolean(type && type.toUpperCase().endsWith("MANUFACTURED_PAYMENT"));
}

export const CADENCES = [
  { value: "monthly", label: "Monthly", days: 30 },
  { value: "quarterly", label: "Quarterly", days: 91 },
  { value: "semiannual", label: "Twice a year", days: 182 },
  { value: "annual", label: "Once a year", days: 365 },
] as const;

export type Cadence = (typeof CADENCES)[number]["value"];

export interface Rhythm {
  cadence: Cadence | null;
  /** Typical days between payments, as observed. */
  medianGapDays: number | null;
  /** How many payments the conclusion rests on. */
  payments: number;
  /**
   * Never "certain". A rhythm is a pattern in your own history, and a company
   * can cut, delay or stop a dividend without warning.
   */
  confidence: "none" | "low" | "good";
  /** Estimated next payment, or null when there's no basis for one. */
  estimatedNext: Date | null;
  /** One line for the interface, always naming this as an estimate. */
  summary: string;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The rhythm of a ticker's payments, if it has one.
 *
 * The median gap is used rather than the mean because one missed or catch-up
 * payment would drag an average across a cadence boundary and turn "quarterly"
 * into "twice a year". A gap is matched to a cadence only if it is within
 * about three weeks of it — wider than that and the honest answer is that the
 * payments are irregular.
 *
 * Two payments give a gap but not a pattern, so they report low confidence and
 * still produce an estimate; one payment produces none at all.
 */
export function inferRhythm(dates: readonly Date[]): Rhythm {
  const sorted = [...dates].map((d) => d.getTime()).sort((a, b) => a - b);

  if (sorted.length < 2) {
    return {
      cadence: null,
      medianGapDays: null,
      payments: sorted.length,
      confidence: "none",
      estimatedNext: null,
      summary:
        sorted.length === 1
          ? "Paid once so far — not enough to see a pattern."
          : "No payments recorded yet.",
    };
  }

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i] - sorted[i - 1]) / DAY_MS);
  }

  const gap = median(gaps);
  const match = CADENCES.find((c) => Math.abs(gap - c.days) <= 21) ?? null;
  const confidence = sorted.length >= 4 ? "good" : "low";
  const estimatedNext = new Date(sorted[sorted.length - 1] + gap * DAY_MS);

  const when = estimatedNext.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const cadenceWord = match ? CADENCES.find((c) => c.value === match.value)!.label.toLowerCase() : null;

  return {
    cadence: match?.value ?? null,
    medianGapDays: Math.round(gap),
    payments: sorted.length,
    confidence,
    estimatedNext,
    summary: cadenceWord
      ? `Paid ${cadenceWord} in your history — next one estimated around ${when}. This is a pattern in your own payments, not an announced date.`
      : `Paid every ${Math.round(gap)} days on average, irregularly — around ${when} on that pattern. An estimate from your own history, not an announced date.`,
  };
}

export interface TickerSummary {
  ticker: string;
  instrumentName: string | null;
  payments: number;
  total: number;
  currency: string;
  firstPaidOn: Date;
  lastPaidOn: Date;
  lastAmount: number;
  rhythm: Rhythm;
  /** True when this ticker's income is interest on cash, not a distribution. */
  interestOnly: boolean;
}

/** Everything received per ticker, most recently paid first. */
export function summariseByTicker(payments: readonly DividendPayment[]): TickerSummary[] {
  const groups = new Map<string, DividendPayment[]>();
  for (const p of payments) {
    const list = groups.get(p.ticker) ?? [];
    list.push(p);
    groups.set(p.ticker, list);
  }

  return Array.from(groups.entries())
    .map(([ticker, list]) => {
      const byDate = [...list].sort((a, b) => a.paidOn.getTime() - b.paidOn.getTime());
      const last = byDate[byDate.length - 1];

      return {
        ticker,
        instrumentName: byDate.find((p) => p.instrumentName)?.instrumentName ?? null,
        payments: byDate.length,
        total: round2(byDate.reduce((s, p) => s + p.amount, 0)),
        currency: last.currency,
        firstPaidOn: byDate[0].paidOn,
        lastPaidOn: last.paidOn,
        lastAmount: last.amount,
        rhythm: inferRhythm(byDate.map((p) => p.paidOn)),
        interestOnly: byDate.every((p) => isInterest(p.type)),
      };
    })
    .sort((a, b) => b.lastPaidOn.getTime() - a.lastPaidOn.getTime());
}

export interface YearSummary {
  year: number;
  total: number;
  payments: number;
}

/** Totals per calendar year, newest first. */
export function summariseByYear(payments: readonly DividendPayment[]): YearSummary[] {
  const totals = new Map<number, { total: number; payments: number }>();

  for (const p of payments) {
    const year = p.paidOn.getUTCFullYear();
    const entry = totals.get(year) ?? { total: 0, payments: 0 };
    entry.total += p.amount;
    entry.payments += 1;
    totals.set(year, entry);
  }

  return Array.from(totals.entries())
    .map(([year, e]) => ({ year, total: round2(e.total), payments: e.payments }))
    .sort((a, b) => b.year - a.year);
}

/**
 * The next payments expected, soonest first.
 *
 * Only from tickers with at least two payments — one payment is a fact, not a
 * rhythm. Estimates already in the past are dropped: a dividend that "should
 * have arrived last month" is not a forecast, it's a sign the pattern broke.
 */
export function upcomingEstimates(
  summaries: readonly TickerSummary[],
  now: Date = new Date()
): TickerSummary[] {
  return summaries
    .filter((s) => s.rhythm.estimatedNext !== null && s.rhythm.estimatedNext > now)
    .sort((a, b) => a.rhythm.estimatedNext!.getTime() - b.rhythm.estimatedNext!.getTime());
}

/**
 * Income over the last twelve months against what the position is worth.
 *
 * Backward-looking on purpose, and named so: this is what it *did* yield, not
 * what it will. Returns null without a value to divide by, rather than zero.
 */
export function trailingYield(
  payments: readonly DividendPayment[],
  currentValue: number | null,
  now: Date = new Date()
): number | null {
  if (currentValue === null || currentValue <= 0) return null;

  const cutoff = new Date(now.getTime() - 365 * DAY_MS);
  const received = payments
    .filter((p) => p.paidOn > cutoff && p.paidOn <= now)
    .reduce((s, p) => s + p.amount, 0);

  if (received === 0) return null;
  return round2((received / currentValue) * 100);
}

/**
 * Sums payments that are **already in one currency**.
 *
 * It ignores `currency` entirely, which is safe only because the caller has
 * converted first. It did not used to be: every caller passed raw rows, so a
 * dollar dividend was added to a euro one and the result rendered with whatever
 * symbol the page happened to use. The actions convert now, and this is left
 * pure rather than given rates because `src/lib` does no I/O.
 *
 * If you reach for this with mixed-currency rows, that is the bug — convert
 * them first.
 */
export function totalReceived(payments: readonly DividendPayment[]): number {
  return round2(payments.reduce((s, p) => s + p.amount, 0));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
