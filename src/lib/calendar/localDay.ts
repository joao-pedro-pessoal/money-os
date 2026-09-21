/**
 * Today, as the person living it counts it.
 *
 * A stored date is a calendar day written in UTC — a manual entry at 12:00Z of
 * the day chosen, an import at midnight UTC — so reading a stored date's day
 * with `toISOString()` is right. *Now* is not a stored date. At 00:30 on
 * 1 October in Lisbon it is still 30 September in UTC, and
 * `new Date().toISOString()` opened the monthly report on September, set
 * "Last month" to August and dated every new entry the day before, for the
 * first hour of each summer day.
 *
 * On the server this is the computer's own clock and zone, which is the
 * person's: the site runs on their PC.
 *
 * Pure.
 */

const two = (n: number) => String(n).padStart(2, "0");

/** The day as YYYY-MM-DD, in local time. */
export function localDay(date: Date = new Date()): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** The month as YYYY-MM, in local time. */
export function localMonth(date: Date = new Date()): string {
  return localDay(date).slice(0, 7);
}
