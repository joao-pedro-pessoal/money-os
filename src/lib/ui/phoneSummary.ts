/**
 * Small sums the phone screens (F30) show, kept pure so they can be tested
 * without a database. They only arrange figures the app already computes.
 */

/** Morning before 12, afternoon before 19 (20 h in summer would still say afternoon). */
export function greetingFor(hour: number): "Good morning" | "Good afternoon" | "Good evening" {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 19) return "Good afternoon";
  return "Good evening";
}

export interface BudgetLike {
  period: string;
  available: number;
  spent: number;
  remaining: number;
  bounds: { start: Date; end: Date };
}

/**
 * The month's budgets as one line: spent, of how much, and what is still free.
 *
 * Only monthly budgets, so a weekly one does not add four weeks' worth to a
 * month or one week's worth to it. What is left counts only budgets still
 * under: an overspent one does not give its overspend back as free money, the
 * same rule as `keptForBudgets`. The days left run to the earliest reset among
 * them, today included, so "5 days" on the 26th of a 30-day month.
 */
export function monthBudgetLine(items: readonly BudgetLike[], today: Date) {
  const monthly = items.filter(item => item.period === "monthly");
  if (monthly.length === 0) return null;
  const round = (n: number) => Math.round(n * 100) / 100;
  const spent = round(monthly.reduce((sum, item) => sum + item.spent, 0));
  const available = round(monthly.reduce((sum, item) => sum + item.available, 0));
  const left = round(monthly.reduce((sum, item) => sum + Math.max(0, item.remaining), 0));
  const end = Math.min(...monthly.map(item => item.bounds.end.getTime()));
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const daysLeft = Math.max(1, Math.round((end - startOfToday) / 86_400_000));
  const percent = available > 0 ? Math.min(100, Math.round((spent / available) * 100)) : 100;
  return { spent, available, left, daysLeft, percent, over: spent > available };
}

export interface SpendRow { date: Date; amount: number; type: string }

/**
 * Money spent in each of the last `months` calendar months, oldest first, the
 * current month last and possibly unfinished. Only expenses: a transfer moves
 * money between your own accounts, and an investment contribution is not spent.
 * Amounts arrive already in one currency.
 */
export function monthlySpending(rows: readonly SpendRow[], today: Date, months = 6) {
  const buckets = Array.from({ length: months }, (_, i) => {
    const start = new Date(today.getFullYear(), today.getMonth() - (months - 1 - i), 1);
    return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1), total: 0 };
  });
  for (const row of rows) {
    if (row.type !== "expense") continue;
    const bucket = buckets.find(b => row.date >= b.start && row.date < b.end);
    if (bucket) bucket.total += Math.abs(row.amount);
  }
  return buckets.map(b => ({ start: b.start, total: Math.round(b.total * 100) / 100 }));
}

/** This month against the one before, as a whole percentage; null with nothing to compare. */
export function changeFromLastMonth(series: readonly { total: number }[]): number | null {
  if (series.length < 2) return null;
  const before = series[series.length - 2].total;
  const now = series[series.length - 1].total;
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Calendar day key in local time, for grouping a list by day. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
