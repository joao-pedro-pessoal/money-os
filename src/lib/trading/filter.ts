/**
 * Narrowing the trade history to a slice of itself.
 *
 * The point of a filter here is not to hide table rows. It is that **every
 * figure recomputes against what is left** — the P&L curve, the win rate, the
 * holding time, the average size. Filtering to one instrument and still seeing
 * the whole account's win rate beside it would be two answers to one question,
 * which is the failure this codebase removes most often.
 *
 * That falls out of the design rather than being arranged: `lib/trading/stats.ts`
 * is a set of pure functions over `TradeRow[]`, so the caller filters the rows
 * and calls the same functions again. There is no second implementation of
 * "win rate on a subset", and there cannot be one.
 *
 * Pure — no DB, no React.
 */

import { directionOf, type TradeRow, type Direction } from "./stats";

/** A row with the fields the table shows but the statistics do not need. */
export interface TradeHistoryRow extends TradeRow {
  /** Which account the event belongs to, for filtering by venue. */
  accountName: string;
  /** The currency it was recorded in, before conversion. */
  currency: string;
}

export interface TradeFilters {
  /** Instrument, or null for every instrument. */
  symbol: string | null;
  /** Event type — BUY, SELL, DIVIDEND, FEE … — or null for all. */
  type: string | null;
  accountName: string | null;
  direction: Direction | null;
  /** ISO day, inclusive. Null for open-ended. */
  from: string | null;
  to: string | null;
}

export const NO_TRADE_FILTERS: TradeFilters = {
  symbol: null,
  type: null,
  accountName: null,
  direction: null,
  from: null,
  to: null,
};

/**
 * The rows a set of filters lets through.
 *
 * Dates are compared as ISO day strings, which sort lexicographically and need
 * no timezone. Doing it with `Date` objects would put a row on the wrong side
 * of a boundary for anyone east or west of UTC, and the failure is seasonal —
 * the same trap `calendarDaysBetween` exists for.
 */
export function applyTradeFilters(
  rows: readonly TradeHistoryRow[],
  filters: TradeFilters
): TradeHistoryRow[] {
  return rows.filter((row) => {
    if (filters.symbol !== null && row.symbol !== filters.symbol) return false;
    if (filters.type !== null && row.type.toUpperCase() !== filters.type.toUpperCase()) return false;
    if (filters.accountName !== null && row.accountName !== filters.accountName) return false;
    if (filters.direction !== null && directionOf(row) !== filters.direction) return false;

    const day = row.date.slice(0, 10);
    if (filters.from !== null && day < filters.from) return false;
    if (filters.to !== null && day > filters.to) return false;

    return true;
  });
}

export interface TradeFilterOptions {
  symbols: string[];
  types: string[];
  accounts: string[];
  directions: Direction[];
  /** The span the data actually covers, for bounding the date inputs. */
  earliest: string | null;
  latest: string | null;
}

/**
 * What there is to filter by, taken from the data rather than from a list.
 *
 * A hard-coded set of instruments would offer ones nobody holds and miss the
 * one imported this morning. Every option here is present in at least one row,
 * so choosing any of them leaves something on screen — a filter that can
 * produce an empty table by construction is a filter nobody trusts twice.
 */
export function tradeFilterOptions(rows: readonly TradeHistoryRow[]): TradeFilterOptions {
  const symbols = new Set<string>();
  const types = new Set<string>();
  const accounts = new Set<string>();
  const directions = new Set<Direction>();
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const row of rows) {
    if (row.symbol !== null && row.symbol !== "") symbols.add(row.symbol);
    if (row.type !== "") types.add(row.type.toUpperCase());
    if (row.accountName !== "") accounts.add(row.accountName);
    directions.add(directionOf(row));

    const day = row.date.slice(0, 10);
    if (earliest === null || day < earliest) earliest = day;
    if (latest === null || day > latest) latest = day;
  }

  return {
    symbols: [...symbols].sort(),
    types: [...types].sort(),
    accounts: [...accounts].sort(),
    // Long, short, then unknown — the order they mean something in, not
    // alphabetical, which would lead with "long" and bury "short" after it.
    directions: (["long", "short", "unknown"] as const).filter((d) => directions.has(d)),
    earliest,
    latest,
  };
}

/** True when anything is actually being narrowed, for showing a "clear" control. */
export function hasActiveTradeFilters(filters: TradeFilters): boolean {
  return Object.values(filters).some((v) => v !== null);
}

/**
 * What the filters are doing, in words, for the screen to show above a total.
 *
 * A figure computed over a subset must say which subset, or it reads as the
 * whole account's — the same reason `getTradeAnalysis` reports how many rows it
 * could not convert instead of quietly leaving them out.
 */
export function describeTradeFilters(filters: TradeFilters): string | null {
  const parts: string[] = [];
  if (filters.symbol !== null) parts.push(filters.symbol);
  if (filters.type !== null) parts.push(filters.type.toLowerCase());
  if (filters.direction !== null) parts.push(filters.direction);
  if (filters.accountName !== null) parts.push(`on ${filters.accountName}`);
  if (filters.from !== null && filters.to !== null) parts.push(`${filters.from} to ${filters.to}`);
  else if (filters.from !== null) parts.push(`from ${filters.from}`);
  else if (filters.to !== null) parts.push(`up to ${filters.to}`);

  return parts.length === 0 ? null : parts.join(" · ");
}
