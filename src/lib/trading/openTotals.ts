/**
 * The totals on "Open positions & balances", which the Open trades widget shows
 * too.
 *
 * Both used to add every row with `toBase(...) ?? 0`, so a position or a
 * platform in a currency with no exchange rate became a result of nothing: the
 * Unrealized P&L card, and the widget beside it, reported a smaller figure with
 * no sign that anything was missing. A dollar-reporting venue on a day the rates
 * could not be read took its whole equity out of "Perps equity" that way.
 *
 * Two definitions of the same card had grown apart as well — the page and the
 * widget route each summed for themselves. They read this one now.
 *
 * Pure.
 */

import { sumInBase, toBase, type RateMap } from "@/lib/fx";

export interface BaseTotal {
  /** What could be converted, in the base currency. */
  total: number;
  /** Currencies that have no exchange rate. Their amounts are not in `total`. */
  unconverted: string[];
  /** Rows that state no figure at all, which are not zero and are not in `total`. */
  unstated: number;
}

/**
 * A list of amounts added in the base currency, with what could not be added
 * kept apart and named — never counted as zero.
 */
export function totalInBase<T>(
  rows: readonly T[],
  read: (row: T) => { amount: number | null; currency: string },
  rates: RateMap,
  base: string
): BaseTotal {
  const stated: { amount: number; currency: string }[] = [];
  let unstated = 0;
  for (const row of rows) {
    const { amount, currency } = read(row);
    if (amount === null || !Number.isFinite(amount)) unstated++;
    else stated.push({ amount, currency });
  }
  const { total, unconverted } = sumInBase(stated, rates, base);
  return { total, unconverted: [...new Set(unconverted.map((u) => u.currency))].sort(), unstated };
}

/** One open position, as `listAllPositions` hands it over. */
export interface OpenPositionFigures {
  unrealizedPnl: number | null;
  positionValue: number | null;
  /** The currency its value and result are reported in. */
  currency: string;
}

/** A connection's last reading, as stored. */
export interface ConnectionFigures {
  reportingCurrency: string | null;
  lastEquity: string | null;
  lastSpotValue: string | null;
  lastWithdrawable: string | null;
  lastMarginUsed: string | null;
}

export interface OpenTotals {
  equity: BaseTotal;
  spot: BaseTotal;
  free: BaseTotal;
  margin: BaseTotal;
  unrealized: BaseTotal;
  notional: BaseTotal;
}

const stored = (value: string | null): number | null => (value === null ? null : Number(value));

export function openTotals(
  positions: readonly OpenPositionFigures[],
  connections: readonly ConnectionFigures[],
  rates: RateMap,
  base: string
): OpenTotals {
  // The same default `listAllPositions` applies: a connection that states no
  // reporting currency was written before the column existed, when every
  // venue reported dollars.
  const platform = (pick: (c: ConnectionFigures) => string | null) =>
    totalInBase(connections, (c) => ({ amount: stored(pick(c)), currency: c.reportingCurrency ?? "USD" }), rates, base);
  const position = (pick: (p: OpenPositionFigures) => number | null) =>
    totalInBase(positions, (p) => ({ amount: pick(p), currency: p.currency }), rates, base);

  return {
    equity: platform((c) => c.lastEquity),
    spot: platform((c) => c.lastSpotValue),
    free: platform((c) => c.lastWithdrawable),
    margin: platform((c) => c.lastMarginUsed),
    unrealized: position((p) => p.unrealizedPnl),
    notional: position((p) => p.positionValue),
  };
}

/**
 * One position's result in the base currency, or null when it states none or
 * its currency has no rate. Null is what the widget shows as "—".
 */
export function resultInBase(position: OpenPositionFigures, rates: RateMap, base: string): number | null {
  return position.unrealizedPnl === null ? null : toBase(position.unrealizedPnl, position.currency, rates, base);
}

/**
 * What a total leaves out, in a line a card can print under it, or null when
 * it leaves out nothing.
 *
 * `unstated` names rows by `noun` ("position", "platform"); pass null where a
 * row stating nothing means the figure does not apply to it — a spot-only
 * venue states no margin because it has none.
 */
export function leftOut(total: BaseTotal, noun: string | null): string | null {
  const parts: string[] = [];
  if (total.unconverted.length > 0) {
    parts.push(`${total.unconverted.join(", ")}: no exchange rate`);
  }
  if (noun !== null && total.unstated > 0) {
    parts.push(`${total.unstated} ${noun}${total.unstated === 1 ? "" : "s"} with no figure`);
  }
  return parts.length === 0 ? null : `Left out — ${parts.join("; ")}`;
}
