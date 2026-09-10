/**
 * Putting a price on reconstructed holdings.
 *
 * Separate from `reconstruct.ts` on purpose. Quantity comes from your own
 * statement and is a fact; price comes from outside and is a dependency that
 * can be missing, late, in the wrong currency, or simply wrong. Keeping them in
 * one module would blur which half of a total is trustworthy.
 *
 * The rule this module exists to enforce: **an instrument with no price is not
 * an instrument worth nothing.** Treating a missing quote as zero silently
 * shrinks the portfolio, and a portfolio that quietly shrinks is the most
 * expensive kind of bug here — you'd act on it. Unpriced holdings are excluded
 * from the total and reported separately, and the total says it is partial.
 *
 * No provider is named anywhere in this file. `Quote` is a shape; where quotes
 * come from is a decision made once, elsewhere, and can change without
 * touching any of this.
 *
 * Pure — no DB, no I/O.
 */

import type { ReconstructedHolding } from "./reconstruct";
import { round2 } from "../accounting";

export interface Quote {
  /** Matches `ReconstructedHolding.key` — an ISIN, or a symbol as fallback. */
  key: string;
  price: number;
  currency: string;
  /** When this price was true. Never assumed to be now. */
  asOf: Date;
  /**
   * Where it came from, in words.
   *
   * Recorded on every quote because a portfolio total that mixes a live feed
   * with a figure typed in by hand three months ago should be able to say so.
   * "manual" is a legitimate value and the fallback when no feed exists.
   */
  source: string;
}

/**
 * Converts between currencies, or returns null when it can't.
 *
 * Injected rather than imported so this module stays pure and the caller keeps
 * control of *which* rates — the app already treats a converted figure as true
 * only at the moment it was converted, and that rule belongs to the caller.
 */
export type Converter = (amount: number, from: string, to: string) => number | null;

export interface ValuedHolding {
  holding: ReconstructedHolding;
  /** Null when unpriced. */
  price: number | null;
  priceCurrency: string | null;
  priceAsOf: Date | null;
  priceSource: string | null;
  /** Quantity × price, in the display currency. Null when unpriced. */
  marketValue: number | null;
  /** Market value minus cost. Null when unpriced. */
  unrealizedPnl: number | null;
  unrealizedPercent: number | null;
  /** Why there's no value, when there isn't. */
  unpricedReason: string | null;
}

export interface ValuationResult {
  currency: string;
  holdings: ValuedHolding[];
  priced: ValuedHolding[];
  unpriced: ValuedHolding[];
  /** Market value of the priced holdings only. */
  totalValue: number;
  /** Cost of the priced holdings only, so the two are comparable. */
  totalCostOfPriced: number;
  /** Cost of everything held, priced or not. */
  totalCostBasis: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPercent: number | null;
  /**
   * True when at least one holding couldn't be priced. The total is then a
   * floor, and every screen showing it must say so.
   */
  partial: boolean;
  /** Share of cost basis that could be priced, 0–100. */
  coveragePercent: number;
  /** The oldest price in the total: how current the whole figure really is. */
  oldestPriceAsOf: Date | null;
}

/**
 * Values holdings, and is candid about the ones it couldn't.
 *
 * `convert` is only consulted when a quote is in a different currency from the
 * one asked for. When it declines, the holding becomes unpriced rather than
 * being counted at an unconverted number — mixing dollars into a euro total is
 * how "€144.84" once became "$144.84" on this dashboard, and the number was
 * wrong by the whole exchange rate while looking perfectly reasonable.
 */
export function valueHoldings(
  holdings: readonly ReconstructedHolding[],
  quotes: readonly Quote[],
  currency: string,
  convert: Converter = (amount, from, to) => (from === to ? amount : null)
): ValuationResult {
  const byKey = new Map(quotes.map((q) => [q.key.toUpperCase(), q]));

  const valued: ValuedHolding[] = holdings.map((holding) => {
    const quote = byKey.get(holding.key.toUpperCase());

    if (!quote) {
      return unpriced(holding, "No price available for this instrument.");
    }
    if (!Number.isFinite(quote.price) || quote.price < 0) {
      return unpriced(holding, "The price received wasn't a usable number.");
    }

    const raw = holding.quantity * quote.price;
    const converted =
      quote.currency.toUpperCase() === currency.toUpperCase()
        ? raw
        : convert(raw, quote.currency, currency);

    if (converted === null) {
      return unpriced(
        holding,
        `Priced in ${quote.currency.toUpperCase()}, and no rate to ${currency.toUpperCase()} was available.`
      );
    }

    const marketValue = round2(converted);
    const unrealizedPnl = round2(marketValue - holding.costBasis);

    return {
      holding,
      price: quote.price,
      priceCurrency: quote.currency,
      priceAsOf: quote.asOf,
      priceSource: quote.source,
      marketValue,
      unrealizedPnl,
      // A cost basis of zero makes the percentage meaningless rather than
      // infinite — the same trap that once put "11248%" on the chart.
      unrealizedPercent:
        holding.costBasis > 0.01 ? round2((unrealizedPnl / holding.costBasis) * 100) : null,
      unpricedReason: null,
    };
  });

  const priced = valued.filter((v) => v.marketValue !== null);
  const notPriced = valued.filter((v) => v.marketValue === null);

  const totalValue = round2(priced.reduce((s, v) => s + (v.marketValue ?? 0), 0));
  const totalCostOfPriced = round2(priced.reduce((s, v) => s + v.holding.costBasis, 0));
  const totalCostBasis = round2(holdings.reduce((s, h) => s + h.costBasis, 0));
  const totalUnrealizedPnl = round2(totalValue - totalCostOfPriced);

  const priceDates = priced
    .map((v) => v.priceAsOf)
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());

  return {
    currency,
    holdings: valued,
    priced,
    unpriced: notPriced,
    totalValue,
    totalCostOfPriced,
    totalCostBasis,
    totalUnrealizedPnl,
    totalUnrealizedPercent:
      totalCostOfPriced > 0.01 ? round2((totalUnrealizedPnl / totalCostOfPriced) * 100) : null,
    partial: notPriced.length > 0,
    coveragePercent:
      totalCostBasis > 0.01 ? round2((totalCostOfPriced / totalCostBasis) * 100) : 100,
    oldestPriceAsOf: priceDates.length > 0 ? new Date(Math.min(...priceDates)) : null,
  };
}

function unpriced(holding: ReconstructedHolding, reason: string): ValuedHolding {
  return {
    holding,
    price: null,
    priceCurrency: null,
    priceAsOf: null,
    priceSource: null,
    marketValue: null,
    unrealizedPnl: null,
    unrealizedPercent: null,
    unpricedReason: reason,
  };
}

/**
 * The sentence to put under a partial total.
 *
 * A number that excludes part of the portfolio has to say what it excludes, in
 * the same breath. Returns null when nothing is missing.
 */
export function describeCoverage(result: ValuationResult): string | null {
  if (!result.partial) return null;

  const missing = result.unpriced.length;
  const names = result.unpriced
    .map((v) => v.holding.symbol ?? v.holding.key)
    .slice(0, 3)
    .join(", ");
  const andMore = missing > 3 ? ` and ${missing - 3} more` : "";

  return `This total leaves out ${missing} holding${missing === 1 ? "" : "s"} with no price (${names}${andMore}), worth ${round2(result.totalCostBasis - result.totalCostOfPriced)} at cost.`;
}

export { isValidIsin, normaliseIsin } from "./isin";
