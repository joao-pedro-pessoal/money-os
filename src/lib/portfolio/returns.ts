/**
 * How well the investing has actually gone.
 *
 * "Up 35 €" is not a return, and neither is profit measured against cost when
 * money has been added and taken out along the way. Deposit 500 € last month
 * and the portfolio is bigger without a single thing having performed. Two
 * different measures answer two different questions, and this app should not
 * pretend either one is the other:
 *
 * - **TWR** (time-weighted) removes the effect of deposits and withdrawals
 *   entirely. It answers *"were my choices good?"* and is what a fund quotes,
 *   because a fund cannot control when its investors add money.
 * - **IRR** (money-weighted, the XIRR of a spreadsheet) keeps that effect in.
 *   It answers *"how did my money actually do?"* — and it is the one that
 *   changes when you buy well but buy late.
 *
 * Both return **null rather than a number** when the data cannot support them.
 * A plausible percentage computed from insufficient history is the most
 * dangerous thing this file could produce: nobody checks a return that looks
 * reasonable.
 *
 * Pure — no DB, no clock.
 */

export interface CashFlow {
  /** ISO date. */
  date: string;
  /**
   * Signed from the portfolio's point of view: money in is negative (it left
   * your pocket), money out is positive. The convention every spreadsheet's
   * XIRR uses, kept identical so a result can be checked against one.
   */
  amount: number;
}

export interface ValuePoint {
  /** ISO date. */
  date: string;
  value: number;
}

const DAY = 86_400_000;

function days(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Money-weighted return (IRR / XIRR)
// ---------------------------------------------------------------------------

/**
 * The annualised rate that makes every dated flow discount back to zero.
 *
 * Solved by bisection rather than Newton-Raphson. Newton is faster and
 * occasionally shoots off to a nonsense root on the irregular flows a real
 * portfolio produces; bisection cannot, as long as the answer is bracketed. On
 * a problem this small the speed difference is nothing and the reliability is
 * the whole point.
 *
 * Returns null when:
 *
 * - there are fewer than two flows, or they are all the same sign — a return
 *   needs money going in and something coming back;
 * - every flow falls on one day, so no time has passed to annualise over;
 * - no rate in a very wide bracket brings the value to zero, which happens on
 *   genuinely pathological flows and must be reported as "cannot tell" rather
 *   than as the edge of the bracket.
 */
export function internalRateOfReturn(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const start = sorted[0].date;

  const hasPositive = sorted.some((f) => f.amount > 0);
  const hasNegative = sorted.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const span = days(start, sorted[sorted.length - 1].date);
  if (span <= 0) return null;

  const npv = (rate: number): number =>
    sorted.reduce((sum, f) => {
      const years = days(start, f.date) / 365;
      return sum + f.amount / Math.pow(1 + rate, years);
    }, 0);

  // -99.99% to +100000%. Wide enough for a short, violent period; bounded so a
  // pathological set fails loudly instead of returning something absurd.
  let low = -0.9999;
  let high = 1000;

  let fLow = npv(low);
  let fHigh = npv(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh)) return null;
  // Same sign at both ends means no root in between; there is nothing to find.
  if (fLow * fHigh > 0) return null;

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    const fMid = npv(mid);
    if (!Number.isFinite(fMid)) return null;
    if (Math.abs(fMid) < 1e-9 || high - low < 1e-9) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }

  return (low + high) / 2;
}

// ---------------------------------------------------------------------------
// Time-weighted return
// ---------------------------------------------------------------------------

export interface TwrResult {
  /** Total return over the covered window, as a fraction. 0.12 is +12%. */
  totalReturn: number;
  /** The same, annualised. Null when the window is under a month. */
  annualised: number | null;
  /** The window actually measured. */
  from: string;
  to: string;
  /** Sub-periods used, one more than the flows inside the window. */
  periods: number;
}

/**
 * Return with the effect of deposits and withdrawals taken out.
 *
 * The portfolio's value is needed on the day of every external flow, because
 * the whole method is to break the history at each flow and chain the returns
 * of the pieces. A flow with no value beside it cannot be chained, and the
 * period around it cannot be measured.
 *
 * **Flows outside the value history are not silently skipped.** The caller is
 * told the window that was covered so it can say so; measuring January's
 * deposits against a portfolio first valued in August would produce a number
 * with no meaning and every appearance of one.
 *
 * Returns null when there are fewer than two value points, which is the honest
 * answer to "how have I done" before there is any history to answer it with.
 */
export function timeWeightedReturn(
  values: ValuePoint[],
  flows: CashFlow[]
): TwrResult | null {
  const points = [...values]
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) return null;

  const from = points[0].date;
  const to = points[points.length - 1].date;

  // Only flows inside the measured window can be chained around.
  const inside = flows
    .filter((f) => f.date >= from && f.date <= to && f.amount !== 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  /** The portfolio's value on or immediately before a date. */
  const valueAt = (date: string): number | null => {
    let found: number | null = null;
    for (const p of points) {
      if (p.date <= date) found = p.value;
      else break;
    }
    return found;
  };

  let chained = 1;
  let periodStartValue = points[0].value;
  let periods = 0;

  for (const flow of inside) {
    const before = valueAt(flow.date);
    if (before === null || periodStartValue <= 0) {
      // Nothing to measure this leg against. Reopen from the flow rather than
      // inventing a return for it.
      periodStartValue = (before ?? 0) - flow.amount;
      continue;
    }

    chained *= before / periodStartValue;
    periods += 1;

    /**
     * The next period opens with the flow applied.
     *
     * `amount` is negative for money in, so subtracting it adds the deposit to
     * the opening value — which is the point of the whole exercise: the
     * deposit changes the base, never the return.
     */
    periodStartValue = before - flow.amount;
  }

  const last = points[points.length - 1].value;
  if (periodStartValue > 0) {
    chained *= last / periodStartValue;
    periods += 1;
  }

  if (periods === 0 || !Number.isFinite(chained)) return null;

  const totalReturn = chained - 1;
  const span = days(from, to);

  return {
    totalReturn,
    // Under a month, annualising magnifies noise into a headline: three good
    // days become "+900% a year", which is arithmetic rather than information.
    annualised: span >= 30 ? Math.pow(chained, 365 / span) - 1 : null,
    from,
    to,
    periods,
  };
}

// ---------------------------------------------------------------------------
// Reporting what could and could not be measured
// ---------------------------------------------------------------------------

export interface ReturnCoverage {
  /** Flows that fell before any recorded value, so TWR cannot see them. */
  flowsBeforeHistory: number;
  /** First date the portfolio's value is known. */
  historyStarts: string | null;
  /** Earliest external flow on record. */
  firstFlow: string | null;
}

/**
 * What the value history does and does not cover.
 *
 * Exists so the interface can say "this measures August onwards" instead of
 * presenting a three-week figure as a lifetime return. The gap is not a bug to
 * hide: snapshots begin when the app was first pointed at the account, and
 * everything before that is genuinely unmeasured.
 */
export function returnCoverage(values: ValuePoint[], flows: CashFlow[]): ReturnCoverage {
  const sortedValues = [...values].sort((a, b) => a.date.localeCompare(b.date));
  const sortedFlows = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const historyStarts = sortedValues[0]?.date ?? null;

  return {
    historyStarts,
    firstFlow: sortedFlows[0]?.date ?? null,
    flowsBeforeHistory:
      historyStarts === null
        ? sortedFlows.length
        : sortedFlows.filter((f) => f.date < historyStarts).length,
  };
}

/** A fraction as a percentage, rounded for display. 0.1234 becomes 12.34. */
export function asPercent(rate: number | null): number | null {
  return rate === null ? null : round2(rate * 100);
}

// ---------------------------------------------------------------------------
// Refusing to answer
// ---------------------------------------------------------------------------

/**
 * Can the recorded contributions explain a portfolio of this size?
 *
 * You cannot hold 730 € having put in a net of −46 €. When that is what the
 * numbers say, the contribution history is incomplete — on this app that
 * happens because only some platforms report deposits and withdrawals, while
 * the value covers every platform. The maths would still produce a rate, and it
 * would be enormous and meaningless.
 *
 * This is the guard that stops it. A money-weighted return is only as good as
 * its record of money going in, and an incomplete record is not a small
 * inaccuracy — it is a different question being answered.
 */
export function contributionsExplainValue(input: {
  netContributed: number;
  currentValue: number;
}): boolean {
  if (input.currentValue <= 0) return true;
  return input.netContributed > 0;
}

/**
 * Is this value history a portfolio growing, or an app being filled in?
 *
 * A series that starts near zero and climbs to its full size in three weeks is
 * not a 8000% return; it is the day the accounts were connected. Nothing in the
 * data distinguishes the two — both are "the value went up" — so the rule is
 * the shape: a real portfolio does not begin at a twentieth of what it is a
 * fortnight later.
 *
 * Deliberately conservative. Refusing a genuine early-days return costs a
 * figure nobody would have trusted anyway; showing 8091% costs the credibility
 * of every other number on the page.
 */
export function historyLooksLikePerformance(values: ValuePoint[]): boolean {
  if (values.length < 2) return false;

  const sorted = [...values].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0].value;
  const largest = Math.max(...sorted.map((p) => p.value));
  if (largest <= 0) return false;

  // A portfolio that starts below a fifth of its own peak within the window is
  // being populated, not performing.
  return first / largest >= 0.2;
}
