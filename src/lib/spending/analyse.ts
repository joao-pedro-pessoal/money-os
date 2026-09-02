/**
 * Where the money went.
 *
 * Every function here takes the same array and answers one question about it,
 * so a filter is applied once and every figure recomputes over what is left.
 * That is the same arrangement `lib/trading/stats.ts` has, for the same reason:
 * a chart describing the whole year beside a table describing March is two
 * answers to one question with nothing on screen saying which is which.
 *
 * **Every amount here is already in the base currency.** Conversion is the
 * caller's job and belongs in `actions/`, which has the rates — mixing the two
 * is how `actions/stats.ts` came to drop `transactions.currency` and add
 * dollars to euros for a whole page of figures.
 *
 * Pure — no DB, no React.
 */

export interface SpendingRow {
  /** ISO timestamp. */
  date: string;
  /** "income" | "expense" | "transfer" | "investment_contribution". */
  type: string;
  /**
   * Signed as stored: negative when money left. Every total below works from
   * the sign rather than from the type, so a refund recorded as a negative
   * expense reduces the category instead of inflating it.
   */
  amount: number;
  categoryName: string | null;
  subcategoryName: string | null;
  accountName: string;
  merchant: string | null;
  /**
   * Whether the category is one you cannot easily change month to month.
   * Rent is fixed, restaurants are not, and the difference is the whole point
   * of knowing your committed spending before deciding anything.
   */
  fixed: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Money that left, as a positive number.
 *
 * Transfers are excluded everywhere in this file: moving €500 from current to
 * savings is not spending, and counting it would make the month look twice as
 * expensive as it was. Contributions to investments are excluded for the same
 * reason — that money is still yours.
 */
export function isSpending(row: SpendingRow): boolean {
  return row.type === "expense";
}

export function isIncome(row: SpendingRow): boolean {
  return row.type === "income";
}

/** The label a row groups under, with unclassified named rather than dropped. */
const UNCATEGORISED = "Uncategorised";

export interface SpendingGroup {
  name: string;
  /** Total spent, positive. */
  spent: number;
  /** How many transactions make it up. */
  count: number;
  /** Share of the filtered spending, 0-100. */
  share: number;
  /** The single largest transaction in the group. */
  largest: number;
}

function groupBy(
  rows: readonly SpendingRow[],
  key: (row: SpendingRow) => string | null
): SpendingGroup[] {
  const totals = new Map<string, { spent: number; count: number; largest: number }>();
  let overall = 0;

  for (const row of rows) {
    if (!isSpending(row)) continue;
    const spent = Math.abs(row.amount);
    /**
     * Named, never dropped. A pile of spending with no category is the most
     * useful thing this page can point at — silently leaving it out would make
     * the shares add up while describing less money than you spent.
     */
    const name = key(row) ?? UNCATEGORISED;

    const entry = totals.get(name) ?? { spent: 0, count: 0, largest: 0 };
    entry.spent += spent;
    entry.count += 1;
    if (spent > entry.largest) entry.largest = spent;
    totals.set(name, entry);
    overall += spent;
  }

  return [...totals.entries()]
    .map(([name, e]) => ({
      name,
      spent: round2(e.spent),
      count: e.count,
      // Zero spending means no shares, not shares of zero.
      share: overall === 0 ? 0 : round2((e.spent / overall) * 100),
      largest: round2(e.largest),
    }))
    .sort((a, b) => b.spent - a.spent);
}

/** Where it goes, by the category you filed it under. */
export function byCategory(rows: readonly SpendingRow[]): SpendingGroup[] {
  return groupBy(rows, (r) => r.categoryName);
}

/** One level down, for when a category is too coarse to act on. */
export function bySubcategory(rows: readonly SpendingRow[]): SpendingGroup[] {
  return groupBy(rows, (r) => r.subcategoryName);
}

/** Who you actually paid — often more actionable than the category. */
export function byMerchant(rows: readonly SpendingRow[]): SpendingGroup[] {
  return groupBy(rows, (r) => r.merchant);
}

export function byAccount(rows: readonly SpendingRow[]): SpendingGroup[] {
  return groupBy(rows, (r) => r.accountName);
}

export interface MonthPoint {
  /** yyyy-mm. */
  month: string;
  income: number;
  spent: number;
  net: number;
}

/**
 * Month by month, income against spending.
 *
 * Only months with something in them appear. Filling the gaps with zeros would
 * draw a line to the floor for a month nobody recorded, which reads as a month
 * of no spending rather than a month of no data.
 */
export function byMonth(rows: readonly SpendingRow[]): MonthPoint[] {
  const months = new Map<string, { income: number; spent: number }>();

  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const entry = months.get(month) ?? { income: 0, spent: 0 };
    if (isIncome(row)) entry.income += Math.abs(row.amount);
    else if (isSpending(row)) entry.spent += Math.abs(row.amount);
    else continue;
    months.set(month, entry);
  }

  return [...months.entries()]
    .map(([month, e]) => ({
      month,
      income: round2(e.income),
      spent: round2(e.spent),
      net: round2(e.income - e.spent),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface WeekdayPoint {
  /** 0 = Monday, so the week reads the way a week is written here. */
  weekday: number;
  label: string;
  spent: number;
  count: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Which day of the week the money goes.
 *
 * Read in UTC, like every other date in this codebase, so a Sunday-evening
 * purchase does not land on Monday for anyone east of Greenwich.
 */
export function byWeekday(rows: readonly SpendingRow[]): WeekdayPoint[] {
  const days = new Map<number, { spent: number; count: number }>();

  for (const row of rows) {
    if (!isSpending(row)) continue;
    // getUTCDay is 0 = Sunday; shifted so Monday leads.
    const weekday = (new Date(row.date).getUTCDay() + 6) % 7;
    const entry = days.get(weekday) ?? { spent: 0, count: 0 };
    entry.spent += Math.abs(row.amount);
    entry.count += 1;
    days.set(weekday, entry);
  }

  return WEEKDAYS.map((label, weekday) => ({
    weekday,
    label,
    spent: round2(days.get(weekday)?.spent ?? 0),
    count: days.get(weekday)?.count ?? 0,
  }));
}

export interface CommittedSplit {
  /** Spending on categories marked fixed: rent, insurance, subscriptions. */
  fixed: number;
  /** Everything else, which is where a decision can still change something. */
  variable: number;
  /** Fixed as a share of spending, 0-100. Null when nothing was spent. */
  fixedShare: number | null;
}

/**
 * What was already committed against what was chosen.
 *
 * The more useful of the two halves is `variable`: it is the money a decision
 * could still have moved. A month that is 90% fixed is not a month to try to
 * economise in, and knowing that before trying is the point.
 */
export function fixedVsVariable(rows: readonly SpendingRow[]): CommittedSplit {
  let fixed = 0;
  let variable = 0;

  for (const row of rows) {
    if (!isSpending(row)) continue;
    if (row.fixed) fixed += Math.abs(row.amount);
    else variable += Math.abs(row.amount);
  }

  const total = fixed + variable;
  return {
    fixed: round2(fixed),
    variable: round2(variable),
    // Null, not zero: no spending means the question has no answer, and 0%
    // would claim nothing was committed.
    fixedShare: total === 0 ? null : round2((fixed / total) * 100),
  };
}

export interface SpendingTotals {
  income: number;
  spent: number;
  net: number;
  transactions: number;
  /** The single biggest thing you paid for, or null when nothing was spent. */
  largest: { name: string; amount: number } | null;
  /** Spending with no category on it, which is what to fix first. */
  uncategorised: number;
}

export function spendingTotals(rows: readonly SpendingRow[]): SpendingTotals {
  let income = 0;
  let spent = 0;
  let uncategorised = 0;
  let largest: { name: string; amount: number } | null = null;

  for (const row of rows) {
    if (isIncome(row)) income += Math.abs(row.amount);
    if (!isSpending(row)) continue;

    const amount = Math.abs(row.amount);
    spent += amount;
    if (row.categoryName === null) uncategorised += amount;
    if (largest === null || amount > largest.amount) {
      largest = { name: row.merchant ?? row.categoryName ?? UNCATEGORISED, amount: round2(amount) };
    }
  }

  return {
    income: round2(income),
    spent: round2(spent),
    net: round2(income - spent),
    // Every row the filter let through, including the transfers no total counts.
    transactions: rows.length,
    largest,
    uncategorised: round2(uncategorised),
  };
}
