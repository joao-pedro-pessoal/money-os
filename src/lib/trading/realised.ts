/**
 * Two things the trade history was getting wrong on a real IBKR account.
 *
 * **A currency conversion is not a trade.** IBKR books an FX conversion as a
 * buy or a sell of `EUR.USD`, so holding a dollar stock in a euro account
 * produces a stream of them. On the live account `EUR.USD` was the single most
 * "traded" instrument — seventeen rows, more than any real position — and every
 * statistic counted them: the trade count, the win rate, the average size, the
 * instrument breakdown. None of them is a position and none has a result.
 *
 * **A venue that reports no result is not a venue with no results.** Only
 * Hyperliquid states a realised P&L per fill: 46 rows of 96. Interactive
 * Brokers states none, on 22 rows, and Trading 212 none on 30 — so the page
 * said "none of which has closed a position yet" about an account that had
 * bought 3.465 FEMY and sold all 3.465 of it a fortnight later.
 *
 * The app already knows how to answer that: `lib/portfolio/reconstruct.ts`
 * matches buys to sells under a named cost-basis method. This does the same for
 * the activity feed, and **keeps the two kinds of number apart**. CLAUDE.md is
 * explicit that a derived realised P&L is this app's claim under a stated
 * method, not the broker's, and the two must never be presented as the same
 * kind of thing.
 *
 * Pure — no DB, no I/O.
 */

/**
 * Both predicates live in `./stats.ts`, beside `isTrade`, because every figure
 * in that file needs them and the import would otherwise run in a circle.
 */
import { isTrade, isInstrumentTrade, isCurrencyConversion, type TradeRow } from "./stats";

/**
 * True when the figure in `realizedPnl` was worked out here rather than stated
 * by the venue.
 *
 * Carried on the row so a screen can never total the two together without
 * choosing to. A broker's number and this app's number answer the same
 * question by different methods and will not agree.
 */
export interface Derivable {
  pnlDerived: boolean;
}

export type RealisedRow = TradeRow & Derivable;

/**
 * Fills in a realised result where the venue states none, by matching sells
 * against the average cost of what was bought.
 *
 * Average cost, not FIFO, and stated rather than assumed: the two give
 * different answers on the same rows, and `reconstruct.ts` already uses average
 * for the statement importer. Using a different method here would mean two
 * screens in one app disagreeing about the same sale.
 *
 * Rules that come out of the data rather than from taste:
 *
 * - A venue's own figure always wins. Where any row of a symbol carries one,
 *   nothing here is derived for that symbol at all — mixing a reported result
 *   with a derived one inside a single instrument's total would produce a
 *   number belonging to neither method.
 * - A sale with nothing bought before it is left alone. The feed reaches back
 *   only as far as the import does, so a position opened earlier would be
 *   priced against a cost of zero and report the entire proceeds as profit.
 * - Currency conversions are skipped. They have no cost basis and no result.
 */
export function deriveRealisedPnl<T extends TradeRow>(
  rows: readonly T[]
): (T & Derivable)[] {
  /** Symbols whose venue already answers the question. */
  const reportedBy = new Set(
    rows.filter((r) => r.realizedPnl !== null && r.symbol).map((r) => r.symbol as string)
  );

  const chronological = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const held = new Map<string, { quantity: number; cost: number }>();
  // Keyed by the row object itself, so whatever extra fields a caller carries
  // — the account, the currency — survive untouched.
  const derived = new Map<T, number>();

  for (const row of chronological) {
    if (!isInstrumentTrade(row) || !row.symbol) continue;
    if (reportedBy.has(row.symbol)) continue;

    const quantity = Math.abs(row.quantity ?? 0);
    if (quantity === 0) continue;

    const position = held.get(row.symbol) ?? { quantity: 0, cost: 0 };

    if (row.type.toUpperCase() === "BUY") {
      // `amount` is negative on a purchase; what it cost is its size.
      position.quantity += quantity;
      position.cost += Math.abs(row.amount);
      held.set(row.symbol, position);
      continue;
    }

    // A sale with nothing open: skipped, not priced against a cost of zero.
    if (position.quantity <= 0) continue;

    /**
     * The average is read before the sale reduces the quantity. Dividing after
     * it has already been reduced is the bug `reconstruct.ts` records having
     * made once, and it inflates the cost of everything sold.
     */
    const sold = Math.min(quantity, position.quantity);
    const averageCost = position.cost / position.quantity;
    const costOfSold = averageCost * sold;
    /** Proceeds are the positive side of a sale. */
    const proceeds = Math.abs(row.amount) * (sold / quantity);

    derived.set(row, round2(proceeds - costOfSold));

    position.quantity -= sold;
    position.cost -= costOfSold;
    held.set(row.symbol, position);
  }

  return rows.map((row) => {
    const value = derived.get(row);
    return value === undefined
      ? { ...row, pnlDerived: false }
      : { ...row, realizedPnl: value, pnlDerived: true };
  });
}

export interface RealisedProvenance {
  /** Closed trades whose result the venue stated. */
  reported: number;
  /** Closed trades whose result this app worked out. */
  derived: number;
  /** Instrument trades still showing no result, because nothing closed. */
  open: number;
  /** Rows excluded from every statistic because they are FX conversions. */
  conversions: number;
}

/**
 * Where each result on screen came from, so the page can say so.
 *
 * A figure this app derived and a figure a broker published are different kinds
 * of claim, and a total that mixes them without saying so is the sort of number
 * nobody can check against anything.
 */
export function realisedProvenance(
  rows: readonly (TradeRow & Derivable)[]
): RealisedProvenance {
  let reported = 0;
  let derived = 0;
  let open = 0;
  let conversions = 0;

  for (const row of rows) {
    if (isTrade(row) && isCurrencyConversion(row.symbol)) {
      conversions += 1;
      continue;
    }
    if (!isInstrumentTrade(row)) continue;

    if (row.realizedPnl === null) open += 1;
    else if (row.pnlDerived) derived += 1;
    else reported += 1;
  }

  return { reported, derived, open, conversions };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
