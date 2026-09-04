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

import { directionOf, isCurrencyConversion, type TradeRow, type Direction } from "./stats";

/** A row with the fields the table shows but the statistics do not need. */
export interface TradeHistoryRow extends TradeRow {
  /** The stored event, so a label can be attached to this row and not a copy. */
  id: string;
  /** Which account the event belongs to, for filtering by venue. */
  accountName: string;
  /** The currency it was recorded in, before conversion. */
  currency: string;
  /**
   * Your own labels. Empty is the ordinary case — most rows are never
   * labelled, and an unlabelled row is not a row labelled "none".
   */
  tags: string[];
  /**
   * How the instrument is classified, and where that is stored.
   *
   * `position_meta` outlives the position: selling out entirely removes the
   * holding but not what you said about it, so a trade closed in June can still
   * be grouped by the risk you assigned it — and still have that risk changed.
   *
   * Present whenever the trade came from a connection, even with every axis
   * unset, because that is what lets the history *set* one. Null only when
   * there is nowhere to write it: an imported row with no connection behind it
   * has no `position_meta` key to own.
   */
  classification?: {
    /** `position_meta` is keyed by these two. */
    connectionId: string;
    coin: string;
    assetType: string | null;
    /** True while the type came from the platform rather than from you. */
    assetTypeAuto: boolean;
    riskLevel: string | null;
    expectedReturn: string | null;
    timeHorizon: string | null;
    liquidity: string | null;
    apr: number | null;
    playlistId: string | null;
    playlistName: string | null;
    notes: string | null;
  } | null;
}

export interface TradeFilters {
  /** Instrument, or null for every instrument. */
  symbol: string | null;
  /** Event type — BUY, SELL, DIVIDEND, FEE … — or null for all. */
  type: string | null;
  accountName: string | null;
  direction: Direction | null;
  /** One of your own labels, or null for every row whether labelled or not. */
  tag: string | null;
  /** ISO day, inclusive. Null for open-ended. */
  from: string | null;
  to: string | null;
}

export const NO_TRADE_FILTERS: TradeFilters = {
  symbol: null,
  type: null,
  accountName: null,
  direction: null,
  tag: null,
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
export function applyTradeFilters<T extends TradeHistoryRow>(
  rows: readonly T[],
  filters: TradeFilters
): T[] {
  return rows.filter((row) => {
    if (filters.symbol !== null && row.symbol !== filters.symbol) return false;
    if (filters.type !== null && row.type.toUpperCase() !== filters.type.toUpperCase()) return false;
    if (filters.accountName !== null && row.accountName !== filters.accountName) return false;
    if (filters.direction !== null && directionOf(row) !== filters.direction) return false;
    if (filters.tag !== null && !row.tags.includes(filters.tag)) return false;

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
  /** Labels actually in use, so choosing one always leaves something on screen. */
  tags: string[];
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
export function tradeFilterOptions(
  rows: readonly TradeHistoryRow[]
): TradeFilterOptions {
  const symbols = new Set<string>();
  const types = new Set<string>();
  const accounts = new Set<string>();
  const directions = new Set<Direction>();
  const tags = new Set<string>();
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const row of rows) {
    if (row.symbol !== null && row.symbol !== "") symbols.add(row.symbol);
    if (row.type !== "") types.add(row.type.toUpperCase());
    if (row.accountName !== "") accounts.add(row.accountName);
    for (const tag of row.tags) tags.add(tag);
    directions.add(directionOf(row));

    const day = row.date.slice(0, 10);
    if (earliest === null || day < earliest) earliest = day;
    if (latest === null || day > latest) latest = day;
  }

  return {
    symbols: [...symbols].sort(),
    types: [...types].sort(),
    accounts: [...accounts].sort(),
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
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
  if (filters.tag !== null) parts.push(`tagged "${filters.tag}"`);
  if (filters.accountName !== null) parts.push(`on ${filters.accountName}`);
  if (filters.from !== null && filters.to !== null) parts.push(`${filters.from} to ${filters.to}`);
  else if (filters.from !== null) parts.push(`from ${filters.from}`);
  else if (filters.to !== null) parts.push(`up to ${filters.to}`);

  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * The ways closed trades can be grouped for a result.
 *
 * All of them come from `position_meta` — what you said the instrument was when
 * you held it — and all survive selling out of it entirely.
 *
 * Every axis is single-valued, so these groups partition the classified history
 * and can honestly be read as a breakdown. A free-form tag axis lived here
 * briefly and was the opposite: a trade could wear three, so the rows summed to
 * more than the account made. It went when the editor did — the classification
 * is the thing already filled in, and nobody labels their history twice.
 */
export const TRADE_GROUPINGS = [
  { key: "assetType", label: "Asset type" },
  { key: "riskLevel", label: "Risk" },
  { key: "expectedReturn", label: "Expected return" },
  { key: "timeHorizon", label: "Time horizon" },
  { key: "liquidity", label: "Liquidity" },
  { key: "playlistName", label: "Playlist" },
] as const;

export type TradeGrouping = (typeof TRADE_GROUPINGS)[number]["key"];

/**
 * The value a row carries on one grouping, as a list.
 *
 * A list rather than a value so `byTag` needs no second shape, and because an
 * unclassified row yields an empty one — which is what keeps it out of every
 * group rather than inventing an "unset" heading that would hold most of the
 * history and say nothing.
 */
export function groupValuesOf(row: TradeHistoryRow, grouping: TradeGrouping): string[] {
  const value = row.classification?.[grouping] ?? null;
  return value === null ? [] : [value];
}

/**
 * Only the instruments that have actually closed something.
 *
 * A trade history is a record of *results*, and an instrument you have only
 * ever bought has produced none — it is a holding, and it belongs on the
 * Investments page. Eight buy-only ETFs sat in this table under a Realised
 * column, which is what prompted this: they were not wrong figures, they were
 * rows that had no business being there.
 *
 * The test is per instrument, not per row. A position closed in part leaves
 * both its opening buys and its closing sells here, because those buys are what
 * the result was made against and hiding them would leave a sale explaining
 * nothing.
 *
 * Non-trade events — dividends, fees — follow their instrument. A dividend from
 * something you still hold in full belongs with the holding, not in a record of
 * trading results.
 *
 * Currency conversions are left where they are. IBKR books an FX leg as a buy
 * of `EUR.USD`, which closes nothing and would be swept up by the rule — but it
 * is not a position anybody opened, so calling it "still open" is wrong, and the
 * page already explains those separately. Removing them here would delete that
 * explanation along with them.
 */
export function onlyClosedPositions<T extends TradeHistoryRow>(
  rows: readonly T[]
): { rows: T[]; openInstruments: string[] } {
  const closed = new Set<string>();
  for (const row of rows) {
    if (row.symbol === null) continue;
    if (row.realizedPnl !== null) closed.add(row.symbol);
  }

  const openInstruments = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    // A row with no instrument at all — a deposit, a platform fee — is not a
    // position and is never something this can call open. Nor is an FX leg.
    if (
      row.symbol === null ||
      closed.has(row.symbol) ||
      isCurrencyConversion(row.symbol)
    ) {
      kept.push(row);
      continue;
    }
    openInstruments.add(row.symbol);
  }

  return { rows: kept, openInstruments: [...openInstruments].sort() };
}
