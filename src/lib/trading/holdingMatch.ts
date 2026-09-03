/**
 * Joining a traded instrument to the position still held in it.
 *
 * Realised profit lives in the trade history; unrealised profit lives in the
 * portfolio. Showing them side by side needs the two to agree on what an
 * instrument is called, and on a live account they mostly do not: of thirty
 * traded symbols, five matched the portfolio exactly.
 *
 * The mismatches are not noise, they are two families and one non-problem:
 *
 *  - **Trading 212 suffixes.** The portfolio carries the API's spelling and the
 *    statement carries the short one: `IGLAl_EQ` against `IGLA`, `EGLNl_EQ`
 *    against `EGLN`, `EUN3d_EQ` against `EUN3`. One lowercase letter and `_EQ`.
 *  - **Trade Republic names an instrument instead of ticking it.** `Bitcoin`
 *    against `BTC`. There is no rule that turns one into the other, only a
 *    table of names, and this app does not guess at names.
 *  - **Instruments you closed.** Traded and no longer held, so having no
 *    unrealised figure is the right answer rather than a failure to match.
 *
 * Currency conversions are not instruments and never appear here. IBKR books
 * an FX leg as a buy or sell of `EUR.USD`, and it was the loudest entry in the
 * unmatched list until `isInstrumentTrade` — the app's existing definition of
 * a trade in a real instrument — replaced a second one written here.
 *
 * The last distinction is what makes this honest. A symbol with nothing left
 * open needs no match; a symbol you are still holding and could not match is a
 * gap, and the screen has to say so rather than print a blank that reads as
 * "nothing gained".
 *
 * Pure — no DB, no React.
 */

import { isInstrumentTrade, type TradeRow } from "./stats";

/**
 * Trading 212's API spelling reduced to the statement's.
 *
 * `_EQ` marks an equity line, and the letter before it is the venue code — `l`
 * for London, `a` for Amsterdam, `d` for the German listing. Removing both
 * gives the ticker the statement writes.
 *
 * Deliberately narrow: it only fires on `_EQ` preceded by a single lowercase
 * letter. A rule that stripped any trailing letter would maul every symbol
 * that legitimately ends in one.
 */
export function normaliseInstrument(symbol: string): string {
  const trimmed = symbol.trim();
  const match = /^(.+?)[a-z]_EQ$/.exec(trimmed);
  return (match?.[1] ?? trimmed).toUpperCase();
}

export interface HeldPosition {
  symbol: string;
  /** Unrealised gain or loss in the base currency, or null when nobody states a cost. */
  unrealised: number | null;
  /** Market value in the base currency. */
  value: number;
}

export interface InstrumentPnl {
  /** As the trade history spells it, which is what the table shows. */
  symbol: string;
  /** Booked: what closing produced. */
  realised: number;
  /** Still open, when a position could be matched. Null is "not matched". */
  unrealised: number | null;
  /** Market value of what is still held, when matched. */
  value: number | null;
  /** Units bought minus units sold, from the trade history alone. */
  netQuantity: number;
  /**
   * Why there is no unrealised figure, when there is none.
   *
   * `closed` is the ordinary case and needs no apology. `unmatched` means the
   * trades say something is still held and the portfolio could not be joined
   * to it — a gap, and one the screen must show rather than leave blank.
   */
  missing: "closed" | "unmatched" | null;
}

/**
 * Realised and unrealised per instrument, and what could not be joined.
 *
 * `realisedBySymbol` comes from the trade statistics rather than being summed
 * again here — there is one definition of a realised result and this is not
 * going to be a second.
 */
export function pairRealisedWithHeld(
  trades: readonly TradeRow[],
  held: readonly HeldPosition[],
  realisedBySymbol: ReadonlyMap<string, number>
): InstrumentPnl[] {
  /** Portfolio positions indexed by their reduced spelling. */
  const byNormalised = new Map<string, HeldPosition>();
  for (const position of held) {
    byNormalised.set(normaliseInstrument(position.symbol), position);
  }

  /** Units still open per traded symbol, from the trades themselves. */
  const netQuantity = new Map<string, number>();
  for (const row of trades) {
    if (!isInstrumentTrade(row) || row.symbol === null || row.quantity === null) continue;
    const signed = row.type.toUpperCase() === "SELL" ? -Math.abs(row.quantity) : Math.abs(row.quantity);
    netQuantity.set(row.symbol, (netQuantity.get(row.symbol) ?? 0) + signed);
  }

  const symbols = [
    ...new Set(trades.filter(isInstrumentTrade).map((r) => r.symbol).filter(Boolean)),
  ] as string[];

  return symbols
    .map((symbol) => {
      const position = byNormalised.get(normaliseInstrument(symbol)) ?? null;
      const net = round(netQuantity.get(symbol) ?? 0);

      return {
        symbol,
        realised: realisedBySymbol.get(symbol) ?? 0,
        unrealised: position?.unrealised ?? null,
        value: position?.value ?? null,
        netQuantity: net,
        missing:
          position !== null
            ? null
            : // A position closed to nothing has no unrealised result, and
              // saying so is different from failing to find one.
              Math.abs(net) < 1e-8
              ? ("closed" as const)
              : ("unmatched" as const),
      };
    })
    .sort((a, b) => Math.abs(b.realised) - Math.abs(a.realised));
}

/** Instruments the trades say are still open and the portfolio could not match. */
export function unmatchedOpen(rows: readonly InstrumentPnl[]): string[] {
  return rows.filter((r) => r.missing === "unmatched").map((r) => r.symbol).sort();
}

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e8) / 1e8;
}
