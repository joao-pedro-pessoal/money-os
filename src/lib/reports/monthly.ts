/**
 * The monthly report: one closed (or current) month, read back as a whole.
 *
 * Nothing here is a new definition. Income, spending, categories and the
 * fixed/variable split come from src/lib/spending/analyse.ts, the same functions
 * Where it goes uses; net worth comes from the series the dashboard draws. This
 * file only chooses the month, sets it beside the one before, and names what it
 * could not measure instead of printing a zero for it.
 */
import {
  byCategory,
  fixedVsVariable,
  isSpending,
  spendingTotals,
  type CommittedSplit,
  type SpendingRow,
  type SpendingTotals,
} from "@/lib/spending/analyse";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "2026-09" → the month before, "2026-08". */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** "September 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Every month that has at least one movement, newest first. */
export function reportMonths(rows: readonly SpendingRow[]): string[] {
  return [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse();
}

export interface CategoryLine {
  name: string;
  spent: number;
  share: number;
  count: number;
  /** Spent in the month before; 0 when nothing was. */
  previous: number;
  /** Change against the month before, or null when there was nothing to compare with. */
  changePercent: number | null;
}

export interface ReportExpense {
  date: string;
  name: string;
  category: string | null;
  account: string;
  amount: number;
}

export interface BudgetLine {
  name: string;
  limit: number;
  spent: number;
  percent: number;
  status: string;
}

export interface MonthlyReport {
  month: string;
  label: string;
  totals: SpendingTotals;
  /** Share of income kept, or null in a month with no income: 0% would claim a measurement. */
  savingsRate: number | null;
  previous: { month: string; label: string; totals: SpendingTotals } | null;
  /** Average spending over up to three earlier months that have data, or null with none. */
  averageSpent: { amount: number; months: number } | null;
  categories: CategoryLine[];
  split: CommittedSplit;
  topExpenses: ReportExpense[];
  /** Money moved into investments: still yours, so never counted as spending. */
  invested: number;
  netWorth: { start: number; end: number; change: number } | null;
  budgets: BudgetLine[];
}

function inMonth(rows: readonly SpendingRow[], month: string): SpendingRow[] {
  return rows.filter((r) => r.date.slice(0, 7) === month);
}

/**
 * Net worth at the start and the end of the month.
 *
 * The start is the last recorded point before the month began, falling back to
 * the first point inside it; the end is the last point inside it. Without a
 * point inside the month there is nothing to report, and the section says so
 * rather than repeating an older figure as if it were this month's.
 */
export function netWorthChange(
  series: readonly { date: string; netWorth: number }[],
  month: string
): { start: number; end: number; change: number } | null {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const inside = sorted.filter((p) => p.date.slice(0, 7) === month);
  if (inside.length === 0) return null;
  const before = sorted.filter((p) => p.date.slice(0, 7) < month).at(-1);
  const start = (before ?? inside[0]).netWorth;
  const end = inside.at(-1)!.netWorth;
  return { start: round2(start), end: round2(end), change: round2(end - start) };
}

export function buildMonthlyReport(input: {
  rows: readonly SpendingRow[];
  month: string;
  netWorthSeries: readonly { date: string; netWorth: number }[];
  budgets?: readonly BudgetLine[];
  topCount?: number;
}): MonthlyReport {
  const { rows, month } = input;
  const current = inMonth(rows, month);
  const totals = spendingTotals(current);

  const before = previousMonth(month);
  const previousRows = inMonth(rows, before);
  const previousTotals = previousRows.length > 0 ? spendingTotals(previousRows) : null;

  const earlier: number[] = [];
  let cursor = before;
  for (let i = 0; i < 3; i++) {
    const monthRows = inMonth(rows, cursor);
    if (monthRows.some(isSpending)) earlier.push(spendingTotals(monthRows).spent);
    cursor = previousMonth(cursor);
  }

  const previousByName = new Map(byCategory(previousRows).map((c) => [c.name, c.spent]));
  const categories = byCategory(current).map((c) => {
    const previous = previousByName.get(c.name) ?? 0;
    return {
      name: c.name,
      spent: c.spent,
      share: c.share,
      count: c.count,
      previous,
      changePercent: previous > 0 ? round2(((c.spent - previous) / previous) * 100) : null,
    };
  });

  const topExpenses = current
    .filter(isSpending)
    .map((r) => ({
      date: r.date.slice(0, 10),
      name: r.merchant ?? r.categoryName ?? "Uncategorised",
      category: r.categoryName,
      account: r.accountName,
      amount: round2(Math.abs(r.amount)),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, input.topCount ?? 10);

  const invested = round2(
    current
      .filter((r) => r.type === "investment_contribution")
      .reduce((s, r) => s + Math.abs(r.amount), 0)
  );

  return {
    month,
    label: monthLabel(month),
    totals,
    savingsRate: totals.income > 0 ? round2((totals.net / totals.income) * 100) : null,
    previous: previousTotals ? { month: before, label: monthLabel(before), totals: previousTotals } : null,
    averageSpent:
      earlier.length === 0
        ? null
        : { amount: round2(earlier.reduce((s, n) => s + n, 0) / earlier.length), months: earlier.length },
    categories,
    split: fixedVsVariable(current),
    topExpenses,
    invested,
    netWorth: netWorthChange(input.netWorthSeries, month),
    budgets: [...(input.budgets ?? [])],
  };
}

/** Commas, quotes and line breaks inside a field would split it; quote those. */
function csvField(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The report as CSV, one section after another, for a spreadsheet or an
 * accountant. Amounts are plain numbers with a dot, in `currency`, so a
 * spreadsheet reads them as numbers in any locale's import dialog.
 */
export function reportToCsv(report: MonthlyReport, currency: string): string {
  const lines: (string | number | null)[][] = [
    ["Money OS monthly report", report.label],
    ["Currency", currency],
    [],
    ["Summary", "This month", report.previous ? report.previous.label : "Month before"],
    ["Income", report.totals.income, report.previous?.totals.income ?? null],
    ["Spent", report.totals.spent, report.previous?.totals.spent ?? null],
    ["Net", report.totals.net, report.previous?.totals.net ?? null],
    ["Savings rate %", report.savingsRate, null],
    ["Invested", report.invested, null],
    ["Fixed spending", report.split.fixed, null],
    ["Variable spending", report.split.variable, null],
    ["Uncategorised spending", report.totals.uncategorised, null],
  ];
  if (report.netWorth) {
    lines.push(
      ["Net worth at start", report.netWorth.start, null],
      ["Net worth at end", report.netWorth.end, null],
      ["Net worth change", report.netWorth.change, null]
    );
  }
  lines.push([], ["Category", "Spent", "Share %", "Transactions", "Month before", "Change %"]);
  for (const c of report.categories) {
    lines.push([c.name, c.spent, c.share, c.count, c.previous, c.changePercent]);
  }
  if (report.budgets.length > 0) {
    lines.push([], ["Budget", "Limit", "Spent", "Used %", "Status"]);
    for (const b of report.budgets) lines.push([b.name, b.limit, b.spent, b.percent, b.status]);
  }
  lines.push([], ["Largest expenses", "Date", "Category", "Account", "Amount"]);
  for (const e of report.topExpenses) lines.push([e.name, e.date, e.category, e.account, e.amount]);
  return lines.map((line) => line.map(csvField).join(",")).join("\n") + "\n";
}
