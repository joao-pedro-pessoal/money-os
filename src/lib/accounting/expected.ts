/**
 * Money that is coming but has not arrived.
 *
 * A salary due on the 25th, a refund, a friend paying you back, a withdrawal
 * still in flight. Sporadic or recurring — the difference is only the cadence,
 * so both are the same thing here.
 *
 * **The rule this file exists to hold: none of it is ever added to Net Worth,
 * to an account balance, or to an income total.** It has not arrived. The value
 * of the feature is saying "1 240 EUR is coming" *beside* what you have, not
 * inside it — a total that includes money you cannot spend is worse than no
 * total at all, because it gets acted on. Same discipline as `budgets`, which
 * moves no money, and `subscriptions`, which forecasts charges without
 * counting them.
 *
 * Cadence comes from `./subscriptions`, unchanged. That module already knows
 * how to walk a monthly anchor forward, and a second implementation of "when
 * is the next one" would disagree with it the first time a month has 31 days.
 * The one thing it has no word for is a payment that happens once, which is
 * why `Arrival` widens `Cadence` rather than replacing it.
 *
 * Pure — no DB, no rates. Amounts keep their own currency and are converted by
 * a layer that has one; summing them here would add euros to dollars, which is
 * this codebase's oldest bug.
 */

import { nextCharge, daysUntil, type Cadence, CADENCES } from "./subscriptions";

/** How often it arrives — or `once`, for something that happens a single time. */
export type Arrival = "once" | Cadence;

export const ARRIVALS: { value: Arrival; label: string }[] = [
  { value: "once", label: "One-off" },
  ...CADENCES.map((c) => ({ value: c.value as Arrival, label: c.label })),
];

export function isArrival(value: string): value is Arrival {
  return value === "once" || CADENCES.some((c) => c.value === value);
}

export interface Expected {
  id: string;
  name: string;
  amount: number;
  currency: string;
  arrival: Arrival;
  expectedAt: Date | null;
  settledAt: Date | null;
  active: boolean;
}

/**
 * Still coming: not settled, not switched off.
 *
 * A settled one-off stays in the table as evidence that what you were owed
 * arrived, and is counted in nothing.
 */
export function isPending(e: Expected): boolean {
  return e.active && e.settledAt === null;
}

/**
 * When the next one lands, or null when nobody has said.
 *
 * A one-off keeps its own date even once it is past: a payment that was due
 * last week has not become a payment due next week, and moving it would hide
 * exactly the thing you want to see. A recurring one rolls forward, which is
 * what `nextCharge` already does.
 */
export function nextArrival(e: Expected, today: Date): Date | null {
  if (e.expectedAt === null) return null;
  if (e.arrival === "once") return e.expectedAt;
  return nextCharge(e.expectedAt, e.arrival, today);
}

/**
 * Late, and only meaningful for a one-off.
 *
 * A recurring arrival is never overdue — it rolls to its next date — so asking
 * would always answer no and invite the reader to think it had been checked.
 */
export function isOverdue(e: Expected, today: Date): boolean {
  if (e.arrival !== "once" || e.expectedAt === null || !isPending(e)) return false;
  return e.expectedAt.getTime() < today.getTime();
}

export interface ExpectedRow extends Expected {
  /** When it next lands, already worked out. */
  next: Date | null;
  /** Days from today, negative when late. Null when there is no date. */
  inDays: number | null;
  overdue: boolean;
}

/**
 * Everything still coming, soonest first.
 *
 * Anything with no date goes last rather than first: it is not urgent, it is
 * unscheduled, and sorting it to the top would put the vaguest thing where the
 * eye lands.
 */
export function pendingRows(rows: readonly Expected[], today: Date): ExpectedRow[] {
  return rows
    .filter(isPending)
    .map((e) => {
      const next = nextArrival(e, today);
      return { ...e, next, inDays: daysUntil(next, today), overdue: isOverdue(e, today) };
    })
    .sort((a, b) => {
      if (a.next === null && b.next === null) return b.amount - a.amount;
      if (a.next === null) return 1;
      if (b.next === null) return -1;
      return a.next.getTime() - b.next.getTime();
    });
}

/**
 * What is coming within a window, as amounts still in their own currencies.
 *
 * Returned unconverted on purpose. This module has no rates, and a total summed
 * across currencies here would be a number in none of them — the bug this
 * codebase has fixed nine times. The caller converts through `sumInBase`, which
 * also reports what it could not.
 *
 * Anything with no date is excluded from a window: "within 30 days" is a claim
 * about timing, and something unscheduled cannot support it.
 */
export function arrivingWithin(
  rows: readonly ExpectedRow[],
  days: number
): { amount: number; currency: string }[] {
  return rows
    .filter((r) => r.inDays !== null && r.inDays <= days)
    .map((r) => ({ amount: r.amount, currency: r.currency }));
}

/** Everything pending, dated or not, still in its own currency. */
export function allPendingAmounts(
  rows: readonly ExpectedRow[]
): { amount: number; currency: string }[] {
  return rows.map((r) => ({ amount: r.amount, currency: r.currency }));
}
