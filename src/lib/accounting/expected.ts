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
  /** Arrived so far of the current one. */
  received?: number;
  /** Added to a recurring one for its current arrival only. */
  extra?: number;
  /** The arrival being tracked, when the schedule alone cannot say. */
  nextAt?: Date | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** What the current one comes to, with anything added for this time. */
export function dueOf(e: Expected): number {
  return round2(e.amount + (e.extra ?? 0));
}

/**
 * What is still coming, and the only figure that may be shown as such.
 *
 * Never below zero: more arriving than was expected closes it, it does not make
 * the app owe you a negative payment.
 */
export function remainingOf(e: Expected): number {
  return Math.max(0, round2(dueOf(e) - (e.received ?? 0)));
}

/**
 * A recurring one that stays on its date until it is dealt with.
 *
 * Part of it has arrived, or something was added for this time, so the amount
 * belongs to that date. Rolling it forward would present what October's salary
 * still owes as if it were November's.
 */
function isHeld(e: Expected): boolean {
  return e.arrival !== "once" && Boolean(e.nextAt) && ((e.received ?? 0) > 0 || (e.extra ?? 0) > 0);
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
  if (isHeld(e)) return e.nextAt!;
  const scheduled = nextCharge(e.expectedAt, e.arrival, today);
  // An arrival that closed this one early has already moved past the schedule;
  // once the calendar catches up the schedule is right again.
  return e.nextAt && scheduled && e.nextAt > scheduled ? e.nextAt : scheduled;
}

/**
 * Late: a one-off past its date, or a recurring one held on a past date.
 *
 * Any other recurring arrival is never overdue — it rolls to its next date — so
 * asking would always answer no and invite the reader to think it had been
 * checked.
 */
export function isOverdue(e: Expected, today: Date): boolean {
  if (e.expectedAt === null || !isPending(e)) return false;
  if (e.arrival !== "once") return isHeld(e) && e.nextAt! < startOfDay(today);
  return e.expectedAt.getTime() < today.getTime();
}

export interface ExpectedRow extends Expected {
  /** When it next lands, already worked out. */
  next: Date | null;
  /** What is still coming of it. */
  remaining: number;
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
      return { ...e, next, remaining: remainingOf(e), inDays: daysUntil(next, today), overdue: isOverdue(e, today) };
    })
    .sort((a, b) => {
      if (a.next === null && b.next === null) return b.remaining - a.remaining;
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
    .map((r) => ({ amount: r.remaining, currency: r.currency }));
}

/** Everything pending, dated or not, still in its own currency. */
export function allPendingAmounts(
  rows: readonly ExpectedRow[]
): { amount: number; currency: string }[] {
  return rows.map((r) => ({ amount: r.remaining, currency: r.currency }));
}

const dayAfter = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
const LOOK_BACK_DAYS = { weekly: 8, monthly: 35, quarterly: 100, yearly: 400 } as const;

/**
 * Which scheduled arrival money landing on `at` belongs to: the nearest.
 *
 * A salary due on the 25th that lands on the 27th is the 25th's, though the
 * schedule has already rolled on to next month; one landing on the 20th of next
 * month is that month's, early. Going by the date on screen alone would skip a
 * payment whenever it came late. Never one already closed, and when part of one
 * is held, that one.
 */
export function occurrenceFor(e: Expected, at: Date): Date | null {
  if (e.arrival === "once" || e.expectedAt === null) return null;
  if (isHeld(e)) return e.nextAt!;
  const anchor = e.expectedAt, cadence = e.arrival;
  const after = nextCharge(anchor, cadence, at)!;
  const floor = new Date(at.getFullYear(), at.getMonth(), at.getDate() - LOOK_BACK_DAYS[cadence]);
  let before: Date | null = null;
  for (let walk = nextCharge(anchor, cadence, floor)!; walk < after; walk = nextCharge(anchor, cadence, dayAfter(walk))!) before = walk;
  const toAfter = daysUntil(after, at)!;
  const nearest = before && daysUntil(at, before)! <= toAfter ? before : after;
  return e.nextAt && nearest < e.nextAt ? e.nextAt : nearest;
}

export interface ExpectedChange {
  received: number;
  extra: number;
  nextAt: Date | null;
  settledAt: Date | null;
  /** This arrival finished the current one. */
  closes: boolean;
}

/**
 * Where it stands once `amount` of it has arrived.
 *
 * A one-off is settled when it is all in. A recurring one starts over at its
 * next date, with nothing carried across. `closeRest` is someone saying the
 * rest is not coming, which closes it just the same.
 */
export function afterArrival(e: Expected, amount: number, at: Date, closeRest = false): ExpectedChange {
  const received = round2((e.received ?? 0) + amount);
  const closes = closeRest || received >= dueOf(e);
  if (e.arrival === "once") {
    return { received, extra: e.extra ?? 0, nextAt: e.nextAt ?? null, settledAt: closes ? at : null, closes };
  }
  const occurrence = occurrenceFor(e, at);
  if (!closes) return { received, extra: e.extra ?? 0, nextAt: occurrence, settledAt: null, closes };
  return { received: 0, extra: 0, nextAt: occurrence ? nextCharge(e.expectedAt, e.arrival, dayAfter(occurrence)) : null, settledAt: null, closes };
}

/**
 * More is coming than was said.
 *
 * On a one-off that is simply a bigger amount. On a recurring one it is for this
 * time only, and stays on that date: a bonus with this month's salary does not
 * raise every salary after it. Changing all of them is what editing is for.
 */
export function afterAddition(e: Expected, amount: number, today: Date): { amount: number; extra: number; nextAt: Date | null } {
  if (e.arrival === "once") return { amount: round2(e.amount + amount), extra: e.extra ?? 0, nextAt: e.nextAt ?? null };
  return { amount: e.amount, extra: round2((e.extra ?? 0) + amount), nextAt: nextArrival(e, today) };
}

export interface FixedIncomeCategory {
  id: string;
  name: string;
  kind: string;
  fixed: boolean;
}

/**
 * Fixed income you have named but not scheduled.
 *
 * Marking a category "fixed" says money of this kind arrives whether you act or
 * not. It does not say how much, or when — a category is a label, not a
 * commitment, and inventing an amount and a date from one would put two numbers
 * on screen that nobody supplied.
 *
 * So the page asks instead. This is what it asks about: the categories whose
 * whole point is that they recur, with nothing recurring set up against them.
 * "Salary, marked fixed, nothing scheduled" is a question worth putting in
 * front of someone; a blank form is not.
 *
 * Settled and stopped rows do not count as scheduled — a salary that arrived
 * once and was marked received is not a standing arrangement.
 */
export function unscheduledFixedIncome(
  categories: readonly FixedIncomeCategory[],
  expected: readonly (Expected & { categoryId: string | null })[]
): FixedIncomeCategory[] {
  const scheduled = new Set(
    expected.filter(isPending).map((e) => e.categoryId).filter((id): id is string => id !== null)
  );

  return categories
    .filter((c) => c.kind === "income" && c.fixed && !scheduled.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
] as const;

/**
 * What a cadence actually needs to be pinned down.
 *
 * A monthly salary needs a day of the month, not a date — asking for
 * "25 September 2026" to mean "the 25th" makes you pick a year you do not care
 * about and reads as a one-off. A weekly one needs a weekday. Quarterly and
 * yearly need a month as well, so they take a full date, and so does a one-off.
 */
export function anchorInputFor(arrival: Arrival): "date" | "dayOfMonth" | "weekday" {
  if (arrival === "monthly") return "dayOfMonth";
  if (arrival === "weekly") return "weekday";
  return "date";
}

/**
 * The anchor date a cadence walks from, built from what was actually asked.
 *
 * `nextCharge` needs a real date. What the form collects is smaller than that —
 * a day, or a weekday — so the missing parts are filled from today, forwards:
 * the next time that day comes round. Anchoring backwards would be equally
 * valid arithmetic and would put a date in the past on screen the moment
 * something was set up, which reads as already late.
 *
 * A day of the month past the end of a short month is not clamped here. The
 * anchor keeps the day you named — the 31st — and `nextCharge` clamps per month
 * as it walks, which is what makes February the 28th and March the 31st again.
 * Clamping at this end would lose the 31 permanently.
 */
export function anchorFrom(
  arrival: Arrival,
  input: { date?: string | null; dayOfMonth?: number | null; weekday?: number | null },
  today: Date
): Date | null {
  const kind = anchorInputFor(arrival);

  if (kind === "date") {
    if (!input.date) return null;
    const parsed = new Date(input.date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (kind === "dayOfMonth") {
    const day = input.dayOfMonth;
    if (day === null || day === undefined || day < 1 || day > 31) return null;

    // This month if the day is still to come, otherwise next month. A month
    // too short for it is skipped rather than clamped, so the 31st stays the
    // 31st instead of becoming that month's last day for good.
    const candidate = new Date(today.getFullYear(), today.getMonth(), day);
    if (candidate.getDate() === day && candidate >= startOfDay(today)) return candidate;

    for (let ahead = 1; ahead <= 12; ahead++) {
      const candidateAhead: Date = new Date(today.getFullYear(), today.getMonth() + ahead, day);
      if (candidateAhead.getDate() === day) return candidateAhead;
    }
    return null;
  }

  const weekday = input.weekday;
  if (weekday === null || weekday === undefined || weekday < 0 || weekday > 6) return null;

  const start = startOfDay(today);
  const ahead = (weekday - start.getDay() + 7) % 7;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + ahead);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
