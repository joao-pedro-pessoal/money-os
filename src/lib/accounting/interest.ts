/**
 * Interest worked out from a rate and a number of days.
 *
 * Typing the amount by hand means you can only record what the bank told you.
 * Computing it means you can check: "at 2.5% on 4 000 € for 31 days I should
 * have received 8,49 €" is a question the bank can be wrong about, and it
 * happens — a rate change applied late, a day-count convention you didn't
 * expect, a withholding you forgot.
 *
 * Simple accrual, not compounding. Between two payment dates the balance earns
 * on itself and nothing more; compounding happens because each payment is added
 * to the balance and the next period earns on the larger figure. Modelling that
 * inside a single period would overstate it.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Days in a year for the accrual.
 *
 * Not cosmetic: 360 pays about 1.4% more interest than 365 for the same rate,
 * which is roughly the whole difference between two competing savings accounts.
 * If the computed figure is consistently a little under what you receive, this
 * is the first thing to change.
 */
export type DayCount = 365 | 360;

export const DAY_COUNTS: { value: DayCount; label: string; help: string }[] = [
  { value: 365, label: "ACT/365", help: "Actual days over 365. The usual convention for retail savings." },
  { value: 360, label: "ACT/360", help: "Actual days over 360. Pays slightly more; common in money markets." },
];

/** Whole days between two dates, ignoring the clock and daylight saving. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

export interface AccrualInput {
  balance: number;
  /** Annual rate as a percentage: 2.5 means 2.5%. */
  aprPercent: number;
  days: number;
  dayCount?: DayCount;
  /** Tax withheld at source, as a percentage. 0 when none applies. */
  withholdingPercent?: number;
}

export interface Accrual {
  gross: number;
  tax: number;
  net: number;
  days: number;
  dailyRate: number;
}

/**
 * What a balance earns over a period.
 *
 * `gross` is what the rate produces; `net` is what lands in the account. Many
 * countries withhold tax on interest at source, so the gross figure will not
 * match the statement and the difference looks like an error when it isn't.
 * The rate is yours to set — the app has no business assuming your tax.
 */
export function accrue(input: AccrualInput): Accrual {
  const dayCount = input.dayCount ?? 365;
  const days = Math.max(0, Math.floor(input.days));
  const dailyRate = input.aprPercent / 100 / dayCount;

  const gross = round2(input.balance * dailyRate * days);
  const tax = round2(gross * ((input.withholdingPercent ?? 0) / 100));

  return { gross, tax, net: round2(gross - tax), days, dailyRate };
}

/**
 * What the account should have earned since it was last paid.
 *
 * Falls back to the account's creation date when nothing has been paid yet,
 * because "since forever" is the only honest starting point at that stage.
 */
export function expectedSince(input: {
  balance: number;
  aprPercent: number;
  since: Date;
  until: Date;
  dayCount?: DayCount;
  withholdingPercent?: number;
}): Accrual {
  return accrue({
    balance: input.balance,
    aprPercent: input.aprPercent,
    days: daysBetween(input.since, input.until),
    dayCount: input.dayCount,
    withholdingPercent: input.withholdingPercent,
  });
}

export type AgreementLevel = "match" | "close" | "off";

export interface Comparison {
  expected: number;
  actual: number;
  difference: number;
  percentOff: number | null;
  level: AgreementLevel;
}

/**
 * Compares what was received against what the rate says.
 *
 * The tolerance is deliberately loose. Banks round per day, apply rate changes
 * mid-period and use conventions they don't publish, so a couple of percent of
 * disagreement is normal and flagging it would train you to ignore the warning.
 * A figure that's off by a fifth is a different matter.
 */
export function compare(expected: number, actual: number): Comparison {
  const difference = round2(actual - expected);
  const percentOff = expected === 0 ? null : round2((Math.abs(difference) / Math.abs(expected)) * 100);

  let level: AgreementLevel = "match";
  if (percentOff !== null) {
    if (percentOff > 20) level = "off";
    else if (percentOff > 2) level = "close";
  }

  return { expected: round2(expected), actual: round2(actual), difference, percentOff, level };
}

/**
 * The rate you actually end up with when interest is paid more than once a year.
 *
 * A 3% APR paid monthly is not 3% a year — each payment joins the balance and
 * earns in turn. Advertised rates are usually the APR, so this is the number
 * worth comparing between accounts.
 */
export function effectiveAnnualRate(aprPercent: number, paymentsPerYear: number): number {
  if (paymentsPerYear <= 0) return aprPercent;
  const r = aprPercent / 100;
  return round2((Math.pow(1 + r / paymentsPerYear, paymentsPerYear) - 1) * 100);
}

/** Interest earned per day at the current balance — the "is this worth it" figure. */
export function perDay(balance: number, aprPercent: number, dayCount: DayCount = 365): number {
  return Math.round(balance * (aprPercent / 100 / dayCount) * 10000) / 10000;
}
