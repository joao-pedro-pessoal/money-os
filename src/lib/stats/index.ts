/**
 * Portfolio and cash-flow statistics. Pure — no DB, no I/O.
 *
 * Everything here is descriptive, not predictive advice: projections extend a
 * measured rate forward and are labelled as such, because a projection dressed
 * up as a forecast is how people make bad decisions with their money.
 */

export interface SeriesPoint {
  /** ISO date, yyyy-mm-dd. */
  date: string;
  value: number;
}

export type PeriodKey = "1d" | "1w" | "1m" | "3m" | "1y" | "all";

export const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: "1d", label: "Day", days: 1 },
  { key: "1w", label: "Week", days: 7 },
  { key: "1m", label: "Month", days: 30 },
  { key: "3m", label: "3 months", days: 90 },
  { key: "1y", label: "Year", days: 365 },
  { key: "all", label: "All time", days: null },
];

export interface PeriodReturn {
  key: PeriodKey;
  label: string;
  /** Value at the start of the window, or null if history doesn't reach back. */
  from: number | null;
  to: number;
  change: number | null;
  percent: number | null;
}

/**
 * Change over each period, measured against the last point at or before the
 * window's start. If history doesn't reach that far back the period reports
 * null rather than pretending the earliest point is the start — that would
 * overstate short-period returns on a young dataset.
 */
export function periodReturns(series: SeriesPoint[], now: Date = new Date()): PeriodReturn[] {
  if (series.length === 0) {
    return PERIODS.map((p) => ({ key: p.key, label: p.label, from: null, to: 0, change: null, percent: null }));
  }

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const earliest = sorted[0];

  return PERIODS.map((p) => {
    let from: number | null;

    if (p.days === null) {
      from = earliest.value;
    } else {
      const cutoff = new Date(now.getTime() - p.days * 86400000).toISOString().slice(0, 10);
      const atOrBefore = sorted.filter((s) => s.date <= cutoff);
      from = atOrBefore.length > 0 ? atOrBefore[atOrBefore.length - 1].value : null;
    }

    const change = from === null ? null : round2(latest.value - from);
    const percent = from === null || from === 0 ? null : round2(((latest.value - from) / Math.abs(from)) * 100);

    return { key: p.key, label: p.label, from, to: latest.value, change, percent };
  });
}

export interface Drawdown {
  /** Largest peak-to-trough fall, as a positive number. */
  maxDrawdown: number;
  maxDrawdownPercent: number;
  peak: number;
  trough: number;
  peakDate: string | null;
  troughDate: string | null;
  /** How far below the all-time peak the latest value sits. */
  currentDrawdown: number;
  currentDrawdownPercent: number;
}

/** Worst fall from a high point — the number that tells you what you've lived through. */
export function drawdown(series: SeriesPoint[]): Drawdown {
  const empty: Drawdown = {
    maxDrawdown: 0, maxDrawdownPercent: 0, peak: 0, trough: 0,
    peakDate: null, troughDate: null, currentDrawdown: 0, currentDrawdownPercent: 0,
  };
  if (series.length === 0) return empty;

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));

  let peak = sorted[0].value;
  let peakDate = sorted[0].date;
  let bestPeak = peak;
  let bestPeakDate = peakDate;
  let maxDrawdown = 0;
  let trough = peak;
  let troughDate = peakDate;

  for (const point of sorted) {
    if (point.value > peak) {
      peak = point.value;
      peakDate = point.date;
    }
    const fall = peak - point.value;
    if (fall > maxDrawdown) {
      maxDrawdown = fall;
      bestPeak = peak;
      bestPeakDate = peakDate;
      trough = point.value;
      troughDate = point.date;
    }
  }

  const allTimePeak = Math.max(...sorted.map((s) => s.value));
  const latest = sorted[sorted.length - 1].value;
  const currentDrawdown = round2(Math.max(0, allTimePeak - latest));

  return {
    maxDrawdown: round2(maxDrawdown),
    maxDrawdownPercent: bestPeak === 0 ? 0 : round2((maxDrawdown / bestPeak) * 100),
    peak: round2(bestPeak),
    trough: round2(trough),
    peakDate: maxDrawdown > 0 ? bestPeakDate : null,
    troughDate: maxDrawdown > 0 ? troughDate : null,
    currentDrawdown,
    currentDrawdownPercent: allTimePeak === 0 ? 0 : round2((currentDrawdown / allTimePeak) * 100),
  };
}

export interface MonthlyFlow {
  month: string; // yyyy-mm
  income: number;
  expenses: number;
  net: number;
  savingsRate: number | null;
}

/**
 * Income, spending and savings rate per month.
 *
 * Savings rate is net / income. It is null when there was no income that month
 * rather than 0 or -Infinity, because "you saved 0%" and "there was nothing to
 * save from" are different statements.
 *
 * **Every amount must already be in the same currency.** There is no `currency`
 * field on the input on purpose: this module is pure and holds no rates, so it
 * cannot convert and must not appear to. The caller converts first — and for a
 * long time `actions/stats.ts` did not, dropping `transactions.currency` on the
 * way in and adding dollars to euros for the whole page below.
 */
export function monthlyFlows(
  transactions: { date: string; amount: number; type: string }[]
): MonthlyFlow[] {
  const byMonth = new Map<string, { income: number; expenses: number }>();

  for (const t of transactions) {
    if (t.type !== "income" && t.type !== "expense") continue; // transfers never count
    const month = t.date.slice(0, 7);
    const entry = byMonth.get(month) ?? { income: 0, expenses: 0 };
    if (t.type === "income") entry.income += Math.abs(t.amount);
    else entry.expenses += Math.abs(t.amount);
    byMonth.set(month, entry);
  }

  return Array.from(byMonth.entries())
    .map(([month, { income, expenses }]) => {
      const net = round2(income - expenses);
      return {
        month,
        income: round2(income),
        expenses: round2(expenses),
        net,
        savingsRate: income === 0 ? null : round2((net / income) * 100),
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Average of the months that had income, ignoring months with none. */
export function averageSavingsRate(flows: MonthlyFlow[]): number | null {
  const withIncome = flows.filter((f) => f.savingsRate !== null);
  if (withIncome.length === 0) return null;
  return round2(withIncome.reduce((s, f) => s + (f.savingsRate ?? 0), 0) / withIncome.length);
}

export interface Concentration {
  /** Herfindahl index, 0-100. Higher means more concentrated. */
  index: number;
  /** Share of the largest single item, 0-100. */
  largestShare: number;
  largestName: string | null;
  /** How many equally-sized items this concentration is equivalent to. */
  effectiveCount: number;
}

/**
 * How much your money depends on one place.
 *
 * Uses the Herfindahl-Hirschman index: sum of squared shares. Its reciprocal
 * is the "effective number" of holdings — a portfolio of 10 positions where
 * one is 90% behaves like roughly 1.2 positions, which a simple count hides.
 */
export function concentration(items: { name: string; value: number }[]): Concentration {
  const positive = items.filter((i) => i.value > 0);
  const total = positive.reduce((s, i) => s + i.value, 0);

  if (total === 0 || positive.length === 0) {
    return { index: 0, largestShare: 0, largestName: null, effectiveCount: 0 };
  }

  let sumSquares = 0;
  let largest = positive[0];
  for (const item of positive) {
    const share = item.value / total;
    sumSquares += share * share;
    if (item.value > largest.value) largest = item;
  }

  return {
    index: round2(sumSquares * 100),
    largestShare: round2((largest.value / total) * 100),
    largestName: largest.name,
    effectiveCount: round2(1 / sumSquares),
  };
}

/** How many months of spending the available money covers. */
export function runway(available: number, monthlyExpenses: number): number | null {
  if (monthlyExpenses <= 0) return null;
  return round2(available / monthlyExpenses);
}

export interface Projection {
  years: number;
  value: number;
}

/**
 * Where the money lands if the measured monthly saving continues.
 *
 * `annualReturn` compounds monthly. This is arithmetic on an assumption, not a
 * forecast — markets don't return a constant rate, and the UI says so.
 */
export function project(
  current: number,
  monthlySaving: number,
  annualReturnPercent: number,
  horizons: number[] = [1, 5, 10]
): Projection[] {
  const monthlyRate = annualReturnPercent / 100 / 12;

  return horizons.map((years) => {
    const months = Math.round(years * 12);
    let value = current;
    for (let i = 0; i < months; i++) {
      value = value * (1 + monthlyRate) + monthlySaving;
    }
    return { years, value: round2(value) };
  });
}

/** Months until a goal is reached at the current saving rate. */
export function monthsToGoal(current: number, target: number, monthlySaving: number): number | null {
  if (current >= target) return 0;
  if (monthlySaving <= 0) return null; // never, at this rate
  return Math.ceil((target - current) / monthlySaving);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
