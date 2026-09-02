/**
 * Narrowing spending to a slice of itself.
 *
 * Same shape as `lib/trading/filter.ts` and for the same reason: the filters
 * narrow one array and every figure recomputes over what is left, so there is
 * never a chart about the year sitting beside a table about March.
 *
 * Pure — no DB, no React.
 */

import type { SpendingRow } from "./analyse";

export interface SpendingFilters {
  categoryName: string | null;
  subcategoryName: string | null;
  accountName: string | null;
  merchant: string | null;
  /** "fixed" | "variable", or null for both. */
  committed: "fixed" | "variable" | null;
  /** ISO day, inclusive. */
  from: string | null;
  to: string | null;
}

export const NO_SPENDING_FILTERS: SpendingFilters = {
  categoryName: null,
  subcategoryName: null,
  accountName: null,
  merchant: null,
  committed: null,
  from: null,
  to: null,
};

/**
 * The rows a set of filters lets through.
 *
 * Dates compare as ISO day strings, which sort correctly and carry no
 * timezone. Comparing `Date` objects would put an evening transaction on the
 * wrong side of a boundary for anyone not on UTC, and the error would be
 * seasonal and therefore invisible in testing.
 */
export function applySpendingFilters(
  rows: readonly SpendingRow[],
  filters: SpendingFilters
): SpendingRow[] {
  return rows.filter((row) => {
    if (filters.categoryName !== null && (row.categoryName ?? "") !== filters.categoryName)
      return false;
    if (
      filters.subcategoryName !== null &&
      (row.subcategoryName ?? "") !== filters.subcategoryName
    )
      return false;
    if (filters.accountName !== null && row.accountName !== filters.accountName) return false;
    if (filters.merchant !== null && (row.merchant ?? "") !== filters.merchant) return false;
    if (filters.committed !== null && row.fixed !== (filters.committed === "fixed")) return false;

    const day = row.date.slice(0, 10);
    if (filters.from !== null && day < filters.from) return false;
    if (filters.to !== null && day > filters.to) return false;

    return true;
  });
}

export interface SpendingFilterOptions {
  categories: string[];
  subcategories: string[];
  accounts: string[];
  merchants: string[];
  earliest: string | null;
  latest: string | null;
  /** True when at least one row is on a fixed category, so the control is worth showing. */
  hasFixed: boolean;
  hasVariable: boolean;
}

/**
 * What there is to filter by, taken from the data.
 *
 * Every option is present in at least one row, so no single choice can empty
 * the screen. A hard-coded list would offer categories nobody has used and
 * miss the one created this morning.
 */
export function spendingFilterOptions(rows: readonly SpendingRow[]): SpendingFilterOptions {
  const categories = new Set<string>();
  const subcategories = new Set<string>();
  const accounts = new Set<string>();
  const merchants = new Set<string>();
  let earliest: string | null = null;
  let latest: string | null = null;
  let hasFixed = false;
  let hasVariable = false;

  for (const row of rows) {
    if (row.categoryName) categories.add(row.categoryName);
    if (row.subcategoryName) subcategories.add(row.subcategoryName);
    if (row.accountName) accounts.add(row.accountName);
    if (row.merchant) merchants.add(row.merchant);
    if (row.fixed) hasFixed = true;
    else hasVariable = true;

    const day = row.date.slice(0, 10);
    if (earliest === null || day < earliest) earliest = day;
    if (latest === null || day > latest) latest = day;
  }

  const sorted = (set: Set<string>) => [...set].sort((a, b) => a.localeCompare(b));

  return {
    categories: sorted(categories),
    subcategories: sorted(subcategories),
    accounts: sorted(accounts),
    merchants: sorted(merchants),
    earliest,
    latest,
    hasFixed,
    hasVariable,
  };
}

export function hasActiveSpendingFilters(filters: SpendingFilters): boolean {
  return Object.values(filters).some((v) => v !== null);
}

/**
 * What the filters are doing, in words.
 *
 * A total computed over a subset has to say which subset, or it reads as the
 * whole record's.
 */
export function describeSpendingFilters(filters: SpendingFilters): string | null {
  const parts: string[] = [];
  if (filters.categoryName !== null) parts.push(filters.categoryName);
  if (filters.subcategoryName !== null) parts.push(filters.subcategoryName);
  if (filters.merchant !== null) parts.push(`at ${filters.merchant}`);
  if (filters.accountName !== null) parts.push(`from ${filters.accountName}`);
  if (filters.committed !== null) parts.push(`${filters.committed} costs only`);
  if (filters.from !== null && filters.to !== null) parts.push(`${filters.from} to ${filters.to}`);
  else if (filters.from !== null) parts.push(`from ${filters.from}`);
  else if (filters.to !== null) parts.push(`up to ${filters.to}`);

  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * The last whole month, and the last twelve, as ready-made ranges.
 *
 * Offered because "this month" is the question people actually ask, and typing
 * two dates to ask it is friction that makes a page go unused.
 */
export function presetRange(
  preset: "last-month" | "last-3-months" | "last-12-months" | "this-year",
  today: Date = new Date()
): { from: string; to: string } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (preset === "last-month") {
    // Day 0 of this month is the last day of the previous one.
    return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
  }
  if (preset === "last-3-months") {
    return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
  }
  if (preset === "this-year") {
    return { from: iso(new Date(Date.UTC(y, 0, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
  }
  return { from: iso(new Date(Date.UTC(y, m - 11, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
}
