/**
 * When your money could pay for your life: a financial-independence plan.
 *
 * The target is what a year of spending needs behind it at a chosen withdrawal
 * rate — €18 000 a year at 4% needs €450 000, the "25 times your spending"
 * rule. The path is the current amount, grown at an assumed return, plus the
 * monthly saving, month by month, until it reaches the target.
 *
 * Everything is in today's money: the return is a *real* return, after
 * inflation, so a target and a path in today's euros can be compared directly.
 * It is arithmetic on assumptions, all of them visible and editable — not a
 * forecast. Markets do not return a constant rate, and a withdrawal rate is a
 * rule of thumb, not a guarantee.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Beyond this the answer is "not at this pace", not a date. */
export const MAX_YEARS = 100;

export interface PlanInput {
  /** What you start from, today. */
  current: number;
  /** Added each month; negative means withdrawing. */
  monthlySaving: number;
  /** Monthly spending the money should pay for once independent. */
  monthlySpending: number;
  /** Annual real return, in percent (after inflation). */
  realReturnPercent: number;
  /** Share of the money spent each year, in percent: 4 for the 4% rule. */
  withdrawalPercent: number;
}

export interface PlanPoint {
  year: number;
  value: number;
}

export interface Plan {
  /** Yearly spending ÷ withdrawal rate. Null when there is no spending or rate to divide by. */
  target: number | null;
  /** current ÷ target, 0–1 and above. Null without a target. */
  progress: number | null;
  /** Months until the target; 0 when already there; null when not within MAX_YEARS. */
  months: number | null;
  /** Year-end values for the chart: to the year after the target, at most `chartYears`. */
  path: PlanPoint[];
}

/**
 * The plan, month by month.
 *
 * The path stops at the month the target is reached; the chart shows it to
 * the year after, or to `chartYears` when it is never reached, so a line that
 * flattens below the target says so without a date.
 */
export function independencePlan(input: PlanInput, chartYears = 40): Plan {
  const { current, monthlySaving, monthlySpending, realReturnPercent, withdrawalPercent } = input;
  const target = monthlySpending > 0 && withdrawalPercent > 0 ? round2((monthlySpending * 12) / (withdrawalPercent / 100)) : null;
  const rate = realReturnPercent / 100 / 12;

  let months: number | null = null;
  let value = current;
  const path: PlanPoint[] = [{ year: 0, value: round2(current) }];

  if (target !== null && current >= target) months = 0;
  const lastMonth = MAX_YEARS * 12;
  for (let m = 1; m <= lastMonth; m++) {
    value = value * (1 + rate) + monthlySaving;
    if (months === null && target !== null && value >= target) months = m;
    if (m % 12 === 0) {
      const year = m / 12;
      // The chart never runs past `chartYears`, so a far date does not jump across a gap.
      const horizon = months === null ? chartYears : Math.min(chartYears, Math.max(1, Math.ceil(months / 12) + 1));
      if (year <= horizon) path.push({ year, value: round2(value) });
      // Keep counting past the chart when the target is still ahead: a plan
      // that takes sixty years is a date, just a far one.
      else if (months !== null) break;
    }
  }

  return {
    target,
    progress: target === null ? null : current / target,
    months,
    path,
  };
}

/**
 * How much sooner (negative) or later a change makes it, in months.
 * Null when either side never reaches the target.
 */
export function monthsGained(base: PlanInput, changed: PlanInput): number | null {
  const a = independencePlan(base).months;
  const b = independencePlan(changed).months;
  return a === null || b === null ? null : b - a;
}
