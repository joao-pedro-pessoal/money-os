/**
 * The periods a report can cover: a week, a month or a year.
 *
 * A period has a key — "2026-W38", "2026-09", "2026" — that sorts in time
 * order as text, so the newest-first lists and the "not in the future" check
 * are plain string comparisons. Days are the calendar days stored dates carry
 * (see `lib/calendar/localDay.ts`), handled with `Date.UTC` so no time zone or
 * clock change can move a day into the next week.
 *
 * A week is the ISO week: Monday to Sunday, belonging to the year its Thursday
 * falls in, which is how Portugal and most of Europe number them. So 29
 * December 2025 is in 2026-W01, and a year can have 53 weeks.
 *
 * Pure.
 */

export type ReportPeriod = "week" | "month" | "year";

export const REPORT_PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-09-17" → a UTC midnight time, the only arithmetic done on days here. */
function dayTime(day: string): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Monday of week 1: the Monday on or before 4 January, which is always in week 1. */
function firstMonday(year: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  return jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
}

/** The ISO week a day is in. */
export function isoWeek(day: string): { year: number; week: number } {
  const time = dayTime(day);
  const thursday = time + (3 - ((new Date(time).getUTCDay() + 6) % 7)) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  return { year, week: Math.floor((thursday - firstMonday(year)) / (7 * DAY)) + 1 };
}

/** The period of `kind` a day (YYYY-MM-DD, or a timestamp starting with one) is in. */
export function periodOf(kind: ReportPeriod, day: string): string {
  if (kind === "month") return day.slice(0, 7);
  if (kind === "year") return day.slice(0, 4);
  const { year, week } = isoWeek(day.slice(0, 10));
  return `${year}-W${pad(week)}`;
}

/** The first and last day of a period, both included. */
export function periodBounds(kind: ReportPeriod, key: string): { from: string; to: string } {
  const year = Number(key.slice(0, 4));
  if (kind === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (kind === "month") {
    const month = Number(key.slice(5, 7));
    return { from: `${key}-01`, to: dayOf(Date.UTC(year, month, 0)) };
  }
  const monday = firstMonday(year) + (Number(key.slice(6)) - 1) * 7 * DAY;
  return { from: dayOf(monday), to: dayOf(monday + 6 * DAY) };
}

/** Whether `key` names a real period of `kind` — what an address may ask for. */
export function isPeriodKey(kind: ReportPeriod, key: string): boolean {
  if (kind === "year") return /^\d{4}$/.test(key);
  if (kind === "month") return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  // Week 53 exists only in some years: a real week is the week of its own Monday.
  return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(key) && periodOf("week", periodBounds("week", key).from) === key;
}

export function previousPeriod(kind: ReportPeriod, key: string): string {
  if (kind === "year") return String(Number(key) - 1);
  if (kind === "month") {
    const [y, m] = key.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  }
  return periodOf("week", dayOf(dayTime(periodBounds("week", key).from) - 7 * DAY));
}

/** How many periods `to` is after `from`: negative when it is before. */
export function periodsBetween(kind: ReportPeriod, from: string, to: string): number {
  if (kind === "year") return Number(to) - Number(from);
  if (kind === "month") {
    return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
  }
  return Math.round((dayTime(periodBounds("week", to).from) - dayTime(periodBounds("week", from).from)) / (7 * DAY));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "September 2026", "2026", or a week as its days: "15–21 Sep 2026", "29 Dec 2025 – 4 Jan 2026". */
export function periodLabel(kind: ReportPeriod, key: string): string {
  if (kind === "year") return key;
  if (kind === "month") return `${LONG_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  const { from, to } = periodBounds("week", key);
  const [fy, fm, fd] = [from.slice(0, 4), Number(from.slice(5, 7)), Number(from.slice(8, 10))];
  const [ty, tm, td] = [to.slice(0, 4), Number(to.slice(5, 7)), Number(to.slice(8, 10))];
  if (fy !== ty) return `${fd} ${MONTHS[fm - 1]} ${fy} – ${td} ${MONTHS[tm - 1]} ${ty}`;
  if (fm !== tm) return `${fd} ${MONTHS[fm - 1]} – ${td} ${MONTHS[tm - 1]} ${ty}`;
  return `${fd}–${td} ${MONTHS[tm - 1]} ${ty}`;
}

/** The twelve months of a year, as month keys. */
export function monthsOfYear(year: string): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
}
