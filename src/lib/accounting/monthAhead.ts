import { nextCharge, type Cadence } from "./subscriptions";

/**
 * The rest of the month at a glance: what is due to leave and what is due to
 * arrive between today and its last day.
 *
 * A forecast, like everything it is built from — subscriptions, budgets and
 * money coming in — and never added to a balance or to Net Worth. The charges
 * arrive later as ordinary transactions, and are counted there.
 */

/** The last moment of the month `today` is in. */
export function endOfMonth(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Whole days from today to the end of the month: 0 on its last day. */
export function daysLeftInMonth(today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return Math.round((last.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Every day a subscription charges from today to `end`.
 *
 * More than one for a weekly one. Each is found from the subscription's own
 * anchor, as `nextCharge` does, so a charge on the 31st stays on the last day
 * of a short month instead of drifting.
 */
export function chargesUntil(
  sub: { cadence: Cadence; nextChargeAt: Date | null; active: boolean },
  today: Date,
  end: Date
): Date[] {
  if (!sub.active) return [];
  const dates: Date[] = [];
  let from = today;
  for (let guard = 0; guard < 60; guard++) {
    const next = nextCharge(sub.nextChargeAt, sub.cadence, from);
    if (!next || next > end) break;
    dates.push(next);
    from = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
  }
  return dates;
}

export interface AheadLine {
  total: number;
  /** Charges, budgets or arrivals behind the total. */
  count: number;
}

export interface MonthAhead {
  /** The month's last day, for the heading. */
  end: Date;
  subscriptions: AheadLine;
  /** What the budgets still have to spend in their current period. */
  budgets: AheadLine;
  comingIn: AheadLine;
  /** What comes in minus what goes out. */
  net: number;
  /** Amounts in a currency with no rate, left out of the totals rather than counted as nothing. */
  unconverted: number;
}

export function monthAhead(input: {
  end: Date;
  subscriptions: AheadLine;
  budgets: AheadLine;
  comingIn: AheadLine;
  unconverted: number;
}): MonthAhead {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ...input,
    net: round2(input.comingIn.total - input.subscriptions.total - input.budgets.total),
  };
}
