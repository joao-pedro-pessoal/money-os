/**
 * The weekly, monthly and annual report: one period, read back as a whole.
 *
 * Nothing here is a new definition. Income, spending, categories and the
 * fixed/variable split come from src/lib/spending/analyse.ts, the same functions
 * Where it goes uses; net worth comes from the series the dashboard draws. This
 * file only chooses the period, sets it beside the one before, and names what
 * it could not measure instead of printing a zero for it. What a week, a month
 * and a year are is `periods.ts`.
 *
 * It began as the monthly report, and the month functions below remain as the
 * month case of the general ones rather than a second copy of them.
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
import { monthsOfYear, periodLabel, periodOf, previousPeriod, type ReportPeriod } from "./periods";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "2026-09" → the month before, "2026-08". */
export function previousMonth(month: string): string {
  return previousPeriod("month", month);
}

/** "September 2026". */
export function monthLabel(month: string): string {
  return periodLabel("month", month);
}

/** Every period of `kind` that has at least one movement, newest first. */
export function reportPeriods(rows: readonly SpendingRow[], kind: ReportPeriod): string[] {
  return [...new Set(rows.map((r) => periodOf(kind, r.date)))].sort().reverse();
}

/** Every month that has at least one movement, newest first. */
export function reportMonths(rows: readonly SpendingRow[]): string[] {
  return reportPeriods(rows, "month");
}

export interface CategoryLine {
  name: string;
  spent: number;
  share: number;
  count: number;
  /** Spent in the period before; 0 when nothing was. */
  previous: number;
  /** Change against the period before, or null when there was nothing to compare with. */
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

export interface PeriodReport {
  kind: ReportPeriod;
  /** "2026-W38", "2026-09" or "2026". */
  key: string;
  label: string;
  totals: SpendingTotals;
  /** Share of income kept, or null in a period with no income: 0% would claim a measurement. */
  savingsRate: number | null;
  previous: { key: string; label: string; totals: SpendingTotals } | null;
  /** Average spending over up to three earlier periods that have data, or null with none. */
  averageSpent: { amount: number; periods: number } | null;
  categories: CategoryLine[];
  split: CommittedSplit;
  topExpenses: ReportExpense[];
  /** Money moved into investments: still yours, so never counted as spending. */
  invested: number;
  netWorth: { start: number; end: number; change: number } | null;
  budgets: BudgetLine[];
  /**
   * A year's report only: each month, with null for a month with no movement
   * rather than a row of zeros that would read as a month of nothing spent.
   */
  months: { key: string; label: string; totals: SpendingTotals | null }[] | null;
}

/** The monthly report is the report of a month. */
export type MonthlyReport = PeriodReport;

function inPeriod(rows: readonly SpendingRow[], kind: ReportPeriod, key: string): SpendingRow[] {
  return rows.filter((r) => periodOf(kind, r.date) === key);
}

/**
 * Net worth at the start and the end of the period.
 *
 * The start is the last recorded point before the period began, falling back to
 * the first point inside it; the end is the last point inside it. Without a
 * point inside the period there is nothing to report, and the section says so
 * rather than repeating an older figure as if it were this period's.
 */
export function netWorthChange(
  series: readonly { date: string; netWorth: number }[],
  key: string,
  kind: ReportPeriod = "month"
): { start: number; end: number; change: number } | null {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const inside = sorted.filter((p) => periodOf(kind, p.date) === key);
  if (inside.length === 0) return null;
  const before = sorted.filter((p) => periodOf(kind, p.date) < key).at(-1);
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
  return buildReport({ ...input, kind: "month", key: input.month });
}

export function buildReport(input: {
  kind: ReportPeriod;
  key: string;
  rows: readonly SpendingRow[];
  netWorthSeries: readonly { date: string; netWorth: number }[];
  budgets?: readonly BudgetLine[];
  topCount?: number;
}): PeriodReport {
  const { rows, kind, key } = input;
  const current = inPeriod(rows, kind, key);
  const totals = spendingTotals(current);

  const before = previousPeriod(kind, key);
  const previousRows = inPeriod(rows, kind, before);
  const previousTotals = previousRows.length > 0 ? spendingTotals(previousRows) : null;

  const earlier: number[] = [];
  let cursor = before;
  for (let i = 0; i < 3; i++) {
    const periodRows = inPeriod(rows, kind, cursor);
    if (periodRows.some(isSpending)) earlier.push(spendingTotals(periodRows).spent);
    cursor = previousPeriod(kind, cursor);
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
    kind,
    key,
    label: periodLabel(kind, key),
    totals,
    savingsRate: totals.income > 0 ? round2((totals.net / totals.income) * 100) : null,
    previous: previousTotals ? { key: before, label: periodLabel(kind, before), totals: previousTotals } : null,
    averageSpent:
      earlier.length === 0
        ? null
        : { amount: round2(earlier.reduce((s, n) => s + n, 0) / earlier.length), periods: earlier.length },
    categories,
    split: fixedVsVariable(current),
    topExpenses,
    invested,
    netWorth: netWorthChange(input.netWorthSeries, key, kind),
    budgets: [...(input.budgets ?? [])],
    months:
      kind === "year"
        ? monthsOfYear(key).map((month) => {
            const monthRows = inPeriod(current, "month", month);
            return {
              key: month,
              label: periodLabel("month", month),
              totals: monthRows.length > 0 ? spendingTotals(monthRows) : null,
            };
          })
        : null,
  };
}

/** "weekly", "monthly", "annual" — what the report is called. */
export function reportName(kind: ReportPeriod): string {
  return kind === "week" ? "weekly" : kind === "month" ? "monthly" : "annual";
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
export function reportToCsv(report: PeriodReport, currency: string): string {
  const noun = report.kind;
  const lines: (string | number | null)[][] = [
    [`Money OS ${reportName(report.kind)} report`, report.label],
    ["Currency", currency],
    [],
    ["Summary", `This ${noun}`, report.previous ? report.previous.label : `The ${noun} before`],
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
  if (report.months) {
    lines.push([], ["Month", "Income", "Spent", "Net"]);
    for (const m of report.months) {
      lines.push([m.label, m.totals?.income ?? null, m.totals?.spent ?? null, m.totals?.net ?? null]);
    }
  }
  lines.push([], ["Category", "Spent", "Share %", "Transactions", `The ${noun} before`, "Change %"]);
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
