/**
 * Narrowing the transaction list to a slice of itself.
 *
 * Same shape as `lib/trading/filter.ts` and `lib/spending/filter.ts`, and for
 * the same reason: the filters narrow one array and every figure recomputes
 * over what is left, so there is never a total about the year sitting beside a
 * table about March.
 *
 * The one thing this has that spending does not is direction. Spending is all
 * one way; a transaction list holds both, and telling them apart is most of
 * what makes the list readable.
 *
 * Pure — no DB, no React.
 */

export interface TransactionRow {
  id: string;
  /** ISO timestamp. */
  date: string;
  /** "income" | "expense" | "investment_contribution". */
  type: string;
  /** Signed and already in the base currency: negative is money leaving. */
  amount: number;
  /** What it was recorded in, before conversion. */
  currency: string;
  accountName: string | null;
  categoryName: string | null;
  description: string | null;
  merchant: string | null;
}

/** Which way the money went, from the sign rather than from the label. */
export type Direction = "in" | "out";

/**
 * Read off the amount, not the type.
 *
 * `investment_contribution` is money leaving to be invested, so its type says
 * one thing and its direction another — and the direction is the sign. Reading
 * the label would put it on the wrong side of a list whose whole job is showing
 * which way money went.
 */
export function directionOf(row: TransactionRow): Direction {
  return row.amount < 0 ? "out" : "in";
}

export interface TransactionFilters {
  accountName: string | null;
  categoryName: string | null;
  /** In, out, or both. */
  direction: Direction | null;
  /** The recorded type, which is narrower than direction. */
  type: string | null;
  /** Matched against description and merchant, case-insensitively. */
  search: string;
  /** ISO day, inclusive. */
  from: string | null;
  to: string | null;
}

export const NO_TRANSACTION_FILTERS: TransactionFilters = {
  accountName: null,
  categoryName: null,
  direction: null,
  type: null,
  search: "",
  from: null,
  to: null,
};

/**
 * The rows a set of filters lets through.
 *
 * Dates compare as ISO day strings, which sort correctly and carry no timezone.
 * Comparing `Date` objects would put an evening transaction on the wrong side
 * of a boundary for anyone not on UTC, and the error would be seasonal and so
 * invisible in testing.
 */
export function applyTransactionFilters<T extends TransactionRow>(
  rows: readonly T[],
  filters: TransactionFilters
): T[] {
  const needle = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    if (filters.accountName !== null && row.accountName !== filters.accountName) return false;
    if (filters.categoryName !== null && row.categoryName !== filters.categoryName) return false;
    if (filters.direction !== null && directionOf(row) !== filters.direction) return false;
    if (filters.type !== null && row.type !== filters.type) return false;

    const day = row.date.slice(0, 10);
    if (filters.from !== null && day < filters.from) return false;
    if (filters.to !== null && day > filters.to) return false;

    if (needle !== "") {
      const haystack = `${row.description ?? ""} ${row.merchant ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

export interface TransactionFilterOptions {
  accounts: string[];
  categories: string[];
  types: string[];
}

/**
 * What the controls can offer, taken from the rows themselves.
 *
 * Only values that actually occur: a category nothing was ever filed under is
 * a control that always returns nothing, which reads as the filter being
 * broken rather than as the category being unused.
 */
export function transactionFilterOptions(
  rows: readonly TransactionRow[]
): TransactionFilterOptions {
  const accounts = new Set<string>();
  const categories = new Set<string>();
  const types = new Set<string>();

  for (const row of rows) {
    if (row.accountName) accounts.add(row.accountName);
    if (row.categoryName) categories.add(row.categoryName);
    if (row.type) types.add(row.type);
  }

  const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return { accounts: sorted(accounts), categories: sorted(categories), types: sorted(types) };
}

export function hasActiveTransactionFilters(filters: TransactionFilters): boolean {
  return (
    filters.accountName !== null ||
    filters.categoryName !== null ||
    filters.direction !== null ||
    filters.type !== null ||
    filters.search.trim() !== "" ||
    filters.from !== null ||
    filters.to !== null
  );
}

export interface TransactionTotals {
  /** Money that came in, as a positive number. */
  inflow: number;
  /** Money that went out, also positive — the sign is in the label. */
  outflow: number;
  /** What is left: inflow − outflow. */
  net: number;
  count: number;
}

/**
 * What the visible slice adds up to.
 *
 * In and out are kept apart rather than netted into one figure. A month with
 * 3 000 in and 2 900 out is not the same as one with 100 in and nothing out,
 * and a single "net" would render them identically — which is the whole reason
 * this list is worth totalling at all.
 *
 * Outflow is reported positive: the sign lives in the word above the number,
 * not in the number, so the two can be compared by eye without reading a minus.
 */
export function transactionTotals(rows: readonly TransactionRow[]): TransactionTotals {
  let inflow = 0;
  let outflow = 0;

  for (const row of rows) {
    if (row.amount < 0) outflow += Math.abs(row.amount);
    else inflow += row.amount;
  }

  return {
    inflow: round2(inflow),
    outflow: round2(outflow),
    net: round2(inflow - outflow),
    count: rows.length,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
