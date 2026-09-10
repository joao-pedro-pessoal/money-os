/**
 * Budgets you define yourself.
 *
 * The first version hardcoded one shape: a monthly limit on one category. That
 * covers "€400 for food" and nothing else. It can't express "€150 a week for
 * going out" across three categories, or "€600 a year for insurance", which are
 * the budgets people actually keep.
 *
 * So a budget is now an envelope with a name, a period, and any set of
 * categories it watches. Everything about it is the user's choice.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export type Period = "weekly" | "monthly" | "quarterly" | "yearly";

export const PERIODS: { value: Period; label: string; perYear: number }[] = [
  { value: "weekly", label: "Every week", perYear: 52 },
  { value: "monthly", label: "Every month", perYear: 12 },
  { value: "quarterly", label: "Every quarter", perYear: 4 },
  { value: "yearly", label: "Every year", perYear: 1 },
];

export function isPeriod(value: string): value is Period {
  return PERIODS.some((p) => p.value === value);
}

export interface Bounds {
  start: Date;
  /** Exclusive: the first moment of the next period. */
  end: Date;
  label: string;
}

/**
 * The period containing `today`, counted forward from the anchor.
 *
 * Anchored rather than aligned to the calendar: a weekly budget that starts on
 * a Wednesday should run Wednesday to Wednesday, not silently jump to Monday
 * because that's what a calendar week is.
 */
export function periodBounds(period: Period, anchor: Date, today: Date): Bounds {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());

  if (period === "weekly") {
    const days = calendarDaysBetween(start, today);
    // A date before the anchor belongs to a period before it, which floor gives
    // as a negative index — correct, and it keeps history readable.
    const index = Math.floor(days / 7);
    const s = addDays(start, index * 7);
    return { start: s, end: addDays(s, 7), label: fmtRange(s, addDays(s, 6)) };
  }

  const months = period === "monthly" ? 1 : period === "quarterly" ? 3 : 12;
  const now = dayStart(today);

  /**
   * Estimate, then walk until the period actually contains today.
   *
   * Comparing day-of-month directly looks simpler and is wrong: an anchor on
   * the 31st has no 31st in February, so the comparison put 28 February inside
   * a period that ended on 28 February. Walking against the clamped dates
   * themselves can't drift, because it asks the same question the bounds
   * answer.
   */
  let index = Math.floor(
    ((today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth())) /
      months
  );

  let guard = 0;
  while (addMonths(start, index * months) > now && guard++ < 1000) index--;
  while (addMonths(start, (index + 1) * months) <= now && guard++ < 1000) index++;

  const s = addMonths(start, index * months);
  const e = addMonths(start, (index + 1) * months);
  return { start: s, end: e, label: fmtRange(s, addDays(e, -1)) };
}

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Whole calendar days between two dates, ignoring the clocks going back.
 *
 * Dividing a millisecond difference by 86 400 000 looks equivalent and isn't:
 * across a daylight-saving change a day is 23 or 25 hours, so the quotient
 * lands at 894.958 instead of 895 and `Math.floor` loses a day.
 *
 * The visible symptom was a weekly budget showing the *previous* week on the
 * very day a new one began — but only for anchors whose weekday matched, and
 * only in months on the far side of a clock change. Spending that day was
 * counted against a period that had already closed.
 *
 * `Date.UTC` on the local calendar parts sidesteps it: the offsets cancel
 * because neither date has a time of day left to be shifted.
 */
function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

/** Clamps to the last day of shorter months, like card issuers do. */
function addMonths(d: Date, n: number): Date {
  const day = d.getDate();
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, lastDay));
  return out;
}

function fmtRange(from: Date, to: Date): string {
  const f = (d: Date) => d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
  return `${f(from)} – ${f(to)}`;
}

/** Steps to the previous or next period. */
export function shiftPeriod(period: Period, bounds: Bounds, delta: number): Bounds {
  if (period === "weekly") {
    const s = addDays(bounds.start, delta * 7);
    return { start: s, end: addDays(s, 7), label: fmtRange(s, addDays(s, 6)) };
  }
  const months = (period === "monthly" ? 1 : period === "quarterly" ? 3 : 12) * delta;
  const s = addMonths(bounds.start, months);
  const e = addMonths(bounds.end, months);
  return { start: s, end: e, label: fmtRange(s, addDays(e, -1)) };
}

export interface Envelope {
  id: string;
  name: string;
  period: Period;
  limit: number;
  anchor: Date;
  rollover: boolean;
  categoryIds: string[];
}

export interface Spend {
  date: Date;
  amount: number;
  categoryId: string | null;
}

export type Status = "under" | "close" | "over" | "none";

/** Within this share of the limit, warn before it's actually breached. */
const CLOSE = 0.9;

/**
 * How many completed periods to look back for rollover.
 *
 * Unbounded carry turns a budget set a year ago into a meaningless number:
 * "you have €4 800 available for food" is technically the sum of every unspent
 * month and useless as guidance. A year is enough to be fair and short enough
 * to stay honest.
 */
export const ROLLOVER_LOOKBACK = 12;

export interface EnvelopeState {
  id: string;
  name: string;
  period: Period;
  bounds: Bounds;
  limit: number;
  /** Unspent (or overspent) carried in from earlier periods. */
  carried: number;
  /** limit + carried — what's actually available this period. */
  available: number;
  spent: number;
  remaining: number;
  percent: number;
  status: Status;
}

export function statusFor(spent: number, available: number): Status {
  if (available <= 0) return spent > 0 ? "over" : "none";
  if (spent > available) return "over";
  if (spent >= available * CLOSE) return "close";
  return "under";
}

function spentIn(envelope: Envelope, spending: Spend[], b: Bounds): number {
  const watched = new Set(envelope.categoryIds);
  let total = 0;
  for (const s of spending) {
    if (s.categoryId === null || !watched.has(s.categoryId)) continue;
    if (s.date < b.start || s.date >= b.end) continue;
    total += Math.abs(s.amount);
  }
  return total;
}

/**
 * Carry from earlier periods.
 *
 * Overspend carries as a negative, not clamped to zero: blowing through last
 * month and starting fresh is the behaviour that makes envelope budgeting
 * pointless. If the number is uncomfortable, that's the number doing its job.
 */
export function carriedInto(envelope: Envelope, spending: Spend[], current: Bounds): number {
  if (!envelope.rollover) return 0;

  let carry = 0;
  let b = current;
  for (let i = 0; i < ROLLOVER_LOOKBACK; i++) {
    b = shiftPeriod(envelope.period, b, -1);
    // Don't count periods from before the budget existed.
    if (b.start < dayStart(envelope.anchor)) break;
    carry += envelope.limit - spentIn(envelope, spending, b);
  }
  return round2(carry);
}

export function envelopeState(
  envelope: Envelope,
  spending: Spend[],
  today: Date,
  atBounds?: Bounds
): EnvelopeState {
  const bounds = atBounds ?? periodBounds(envelope.period, envelope.anchor, today);
  const carried = carriedInto(envelope, spending, bounds);
  const available = round2(envelope.limit + carried);
  const spent = round2(spentIn(envelope, spending, bounds));

  return {
    id: envelope.id,
    name: envelope.name,
    period: envelope.period,
    bounds,
    limit: round2(envelope.limit),
    carried,
    available,
    spent,
    remaining: round2(available - spent),
    percent: available > 0 ? Math.round((spent / available) * 100) : 0,
    status: statusFor(spent, available),
  };
}

/** How far through the period we are, 0-1. */
export function periodProgress(bounds: Bounds, today: Date): number {
  const span = bounds.end.getTime() - bounds.start.getTime();
  if (span <= 0) return 1;
  const done = today.getTime() - bounds.start.getTime();
  return Math.min(1, Math.max(0, done / span));
}

/** True when spending is running ahead of the calendar, mid-period only. */
export function isPacingOver(state: EnvelopeState, progress: number): boolean {
  if (state.available <= 0 || progress <= 0.05 || progress >= 0.95) return false;
  return state.spent / state.available > progress;
}

/** Normalises any period to a monthly figure, so envelopes can be compared. */
export function monthlyEquivalent(limit: number, period: Period): number {
  const perYear = PERIODS.find((p) => p.value === period)?.perYear ?? 12;
  return round2((limit * perYear) / 12);
}
