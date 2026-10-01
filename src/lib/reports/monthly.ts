/**
 * The weekly, monthly, annual and custom report: one stretch of days, read
 * back as a whole.
 *
 * Nothing here is a new definition. Income, spending, categories and the
 * fixed/variable split come from src/lib/spending/analyse.ts, the same functions
 * Where it goes uses; net worth comes from the series the dashboard draws. This
 * file only chooses the period, sets it beside the one before, and names what
 * it could not measure instead of printing a zero for it. What a week, a month
 * and a year are is `periods.ts`; a custom range is any two days you pick, set
 * beside the range of the same length just before it.
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
import {
  isDay,
  monthsBetween,
  monthsOfYear,
  periodBounds,
  periodLabel,
  periodOf,
  previousPeriod,
  rangeBefore,
  rangeLabel,
  type ReportKind,
  type ReportPeriod,
} from "./periods";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The days a report covers, and what it is called.
 *
 * Every period becomes this before anything is counted, so a week, a month, a
 * year and a range you typed are filtered by the same comparison of days and
 * cannot disagree about which rows they hold.
 */
export interface ReportWindow {
  kind: ReportKind;
  /** "2026-W38", "2026-09", "2026", or "2026-03-03..2026-04-17" for a custom range. */
  key: string;
  /** First and last day, both included. */
  from: string;
  to: string;
  label: string;
}

/** A custom range as one key, for the address and the file name. */
export function customKey(from: string, to: string): string {
  return `${from}..${to}`;
}

/** The two days of a custom key, or null when it does not name a real range. */
export function parseCustomKey(key: string): { from: string; to: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (!match || !isDay(match[1]) || !isDay(match[2]) || match[1] > match[2]) return null;
  return { from: match[1], to: match[2] };
}

export function reportWindow(kind: ReportKind, key: string): ReportWindow {
  if (kind === "custom") {
    const range = parseCustomKey(key);
    if (range === null) throw new Error(`Not a range of days: ${key}`);
    return { kind, key, ...range, label: rangeLabel(range.from, range.to) };
  }
  return { kind, key, ...periodBounds(kind, key), label: periodLabel(kind, key) };
}

/** The period before: the week, month or year before, or the same number of days just before a range. */
export function windowBefore(window: ReportWindow): ReportWindow {
  if (window.kind === "custom") {
    const before = rangeBefore(window.from, window.to);
    return reportWindow("custom", customKey(before.from, before.to));
  }
  return reportWindow(window.kind, previousPeriod(window.kind, window.key));
}

/** A stored date's day — the same reading `periodOf` makes. */
const dayOfRow = (date: string) => date.slice(0, 10);

function inWindow<T extends { date: string }>(rows: readonly T[], window: { from: string; to: string }): T[] {
  return rows.filter((r) => dayOfRow(r.date) >= window.from && dayOfRow(r.date) <= window.to);
}

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
  kind: ReportKind;
  /** "2026-W38", "2026-09", "2026" or "2026-03-03..2026-04-17". */
  key: string;
  label: string;
  /** First and last day covered, both included. */
  from: string;
  to: string;
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
  /**
   * Net worth through the period, for drawing: the value it opened at, then
   * every recorded point inside. Empty when nothing was recorded inside.
   */
  netWorthLine: { date: string; value: number }[];
  budgets: BudgetLine[];
  /**
   * A year's report, and a custom range that crosses into another month: each
   * month, with null for a month with no movement rather than a row of zeros
   * that would read as a month of nothing spent. `partial` marks a month the
   * range only covers part of, so its figures are not read as the whole month's.
   */
  months: { key: string; label: string; partial: boolean; totals: SpendingTotals | null }[] | null;
}

/** The monthly report is the report of a month. */
export type MonthlyReport = PeriodReport;

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
  return netWorthBetween(series, periodBounds(kind, key));
}

/** The same, over any two days. */
export function netWorthBetween(
  series: readonly { date: string; netWorth: number }[],
  window: { from: string; to: string }
): { start: number; end: number; change: number } | null {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const inside = inWindow(sorted, window);
  if (inside.length === 0) return null;
  const before = sorted.filter((p) => dayOfRow(p.date) < window.from).at(-1);
  const start = (before ?? inside[0]).netWorth;
  const end = inside.at(-1)!.netWorth;
  return { start: round2(start), end: round2(end), change: round2(end - start) };
}

/**
 * Net worth through the period as points to draw, opening at the value it
 * started from — the same start `netWorthBetween` reports, placed on the first
 * day so the line and the figure beside it begin at one number.
 */
export function netWorthLine(
  series: readonly { date: string; netWorth: number }[],
  window: { from: string; to: string }
): { date: string; value: number }[] {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const inside = inWindow(sorted, window).map((p) => ({ date: dayOfRow(p.date), value: round2(p.netWorth) }));
  if (inside.length === 0) return [];
  const before = sorted.filter((p) => dayOfRow(p.date) < window.from).at(-1);
  if (before === undefined || inside[0].date === window.from) return inside;
  return [{ date: window.from, value: round2(before.netWorth) }, ...inside];
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
  kind: ReportKind;
  key: string;
  rows: readonly SpendingRow[];
  netWorthSeries: readonly { date: string; netWorth: number }[];
  budgets?: readonly BudgetLine[];
  topCount?: number;
}): PeriodReport {
  const { rows, kind, key } = input;
  const window = reportWindow(kind, key);
  const current = inWindow(rows, window);
  const totals = spendingTotals(current);

  const before = windowBefore(window);
  const previousRows = inWindow(rows, before);
  const previousTotals = previousRows.length > 0 ? spendingTotals(previousRows) : null;

  const earlier: number[] = [];
  let cursor = before;
  for (let i = 0; i < 3; i++) {
    const periodRows = inWindow(rows, cursor);
    if (periodRows.some(isSpending)) earlier.push(spendingTotals(periodRows).spent);
    cursor = windowBefore(cursor);
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
    label: window.label,
    from: window.from,
    to: window.to,
    totals,
    savingsRate: totals.income > 0 ? round2((totals.net / totals.income) * 100) : null,
    previous: previousTotals ? { key: before.key, label: before.label, totals: previousTotals } : null,
    averageSpent:
      earlier.length === 0
        ? null
        : { amount: round2(earlier.reduce((s, n) => s + n, 0) / earlier.length), periods: earlier.length },
    categories,
    split: fixedVsVariable(current),
    topExpenses,
    invested,
    netWorth: netWorthBetween(input.netWorthSeries, window),
    netWorthLine: netWorthLine(input.netWorthSeries, window),
    budgets: [...(input.budgets ?? [])],
    months: monthsOf(window, current),
  };
}

/**
 * A year's twelve months, or the months a custom range crosses — a range inside
 * one month has nothing to break down. Rows arrive already inside the window,
 * so a month the range covers only part of counts only that part.
 */
function monthsOf(window: ReportWindow, current: readonly SpendingRow[]): PeriodReport["months"] {
  const keys =
    window.kind === "year"
      ? monthsOfYear(window.key)
      : window.kind === "custom" && window.from.slice(0, 7) !== window.to.slice(0, 7)
        ? monthsBetween(window.from, window.to)
        : null;
  if (keys === null) return null;
  return keys.map((month) => {
    const bounds = periodBounds("month", month);
    const monthRows = current.filter((r) => periodOf("month", r.date) === month);
    return {
      key: month,
      label: periodLabel("month", month),
      partial: bounds.from < window.from || bounds.to > window.to,
      totals: monthRows.length > 0 ? spendingTotals(monthRows) : null,
    };
  });
}

/** "weekly", "monthly", "annual", "custom" — what the report is called. */
export function reportName(kind: ReportKind): string {
  return kind === "week" ? "weekly" : kind === "month" ? "monthly" : kind === "year" ? "annual" : "custom";
}

/** What one of these is called in a sentence: "this month", "the period before". */
export function periodNoun(kind: ReportKind): string {
  return kind === "custom" ? "period" : kind;
}

/** Commas, quotes and line breaks inside a field would split it; quote those. */
export function csvField(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type CsvLine = (string | number | null)[];

/** The lines every report's CSV opens with: what it is, which days, which currency. */
export function csvHeader(
  kind: ReportKind,
  label: string,
  window: { from: string; to: string },
  currency: string
): CsvLine[] {
  return [
    [`Money OS ${reportName(kind)} report`, label],
    ["From", window.from, "To", window.to],
    ["Currency", currency],
  ];
}

export function csvText(lines: readonly CsvLine[]): string {
  return lines.map((line) => line.map(csvField).join(",")).join("\n") + "\n";
}

/**
 * The report as CSV, one section after another, for a spreadsheet or an
 * accountant. Amounts are plain numbers with a dot, in `currency`, so a
 * spreadsheet reads them as numbers in any locale's import dialog.
 */
export function reportToCsv(report: PeriodReport, currency: string): string {
  return csvText([...csvHeader(report.kind, report.label, report, currency), [], ...moneyCsvLines(report)]);
}

/** The day-to-day money part of the CSV, one section after another. */
export function moneyCsvLines(report: PeriodReport): CsvLine[] {
  const noun = periodNoun(report.kind);
  const lines: CsvLine[] = [
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
      const label = m.partial ? `${m.label} (part)` : m.label;
      lines.push([label, m.totals?.income ?? null, m.totals?.spent ?? null, m.totals?.net ?? null]);
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
  return lines;
}
