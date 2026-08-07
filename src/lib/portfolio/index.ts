/**
 * Pure P&L math for investment positions.
 * No DB, no I/O — same discipline as src/lib/accounting.
 *
 * Direction matters: a long position gains when the price rises, a short
 * position gains when it falls. Everything downstream (totals, analysis,
 * charts) goes through these functions so the sign is never handled ad hoc.
 */

export type Direction = "long" | "short";

export interface HoldingLike {
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  direction?: Direction | string | null;
}

function isShort(h: HoldingLike): boolean {
  return h.direction === "short";
}

/**
 * What the position is worth right now.
 *
 * For a short, the capital at stake is the cost basis, and the gain/loss moves
 * against the price — so its "value" is basis + P&L rather than qty x price.
 * This keeps `marketValue` meaningful as "what this position is worth to me".
 */
export function marketValue(h: HoldingLike): number {
  if (isShort(h)) {
    return round2(costBasis(h) + unrealizedPnL(h));
  }
  return round2(h.quantity * h.currentPrice);
}

export function costBasis(h: HoldingLike): number {
  return round2(h.quantity * h.avgEntryPrice);
}

export function unrealizedPnL(h: HoldingLike): number {
  const perUnit = isShort(h) ? h.avgEntryPrice - h.currentPrice : h.currentPrice - h.avgEntryPrice;
  return round2(perUnit * h.quantity);
}

export function unrealizedPnLPercent(h: HoldingLike): number {
  const basis = costBasis(h);
  if (basis === 0) return 0;
  return round2((unrealizedPnL(h) / basis) * 100);
}

export function portfolioTotals(holdings: HoldingLike[]) {
  const totalValue = round2(holdings.reduce((s, h) => s + marketValue(h), 0));
  const totalCost = round2(holdings.reduce((s, h) => s + costBasis(h), 0));
  const totalPnL = round2(holdings.reduce((s, h) => s + unrealizedPnL(h), 0));
  const totalPnLPercent = totalCost === 0 ? 0 : round2((totalPnL / totalCost) * 100);
  return { totalValue, totalCost, totalPnL, totalPnLPercent };
}

/**
 * Buying more of the same position: the new average entry price is the
 * weighted average of what you already held and what you just added.
 */
export function reinforcePosition(
  current: { quantity: number; avgEntryPrice: number },
  added: { quantity: number; price: number }
): { quantity: number; avgEntryPrice: number } {
  const totalQuantity = current.quantity + added.quantity;
  if (totalQuantity <= 0) {
    return { quantity: 0, avgEntryPrice: 0 };
  }
  const totalCost = current.quantity * current.avgEntryPrice + added.quantity * added.price;
  return {
    quantity: round8(totalQuantity),
    avgEntryPrice: round4(totalCost / totalQuantity),
  };
}

/**
 * Selling part (or all) of a position.
 *
 * The average entry price does NOT change on a sale — only the quantity drops
 * and the profit on the units sold becomes realized. Returns the new state
 * plus the P&L locked in by this sale.
 */
export function reducePosition(
  current: { quantity: number; avgEntryPrice: number; direction?: Direction | string | null },
  sold: { quantity: number; price: number }
): { quantity: number; avgEntryPrice: number; realized: number } {
  const soldQuantity = Math.min(sold.quantity, current.quantity);
  const perUnit =
    current.direction === "short" ? current.avgEntryPrice - sold.price : sold.price - current.avgEntryPrice;

  return {
    quantity: round8(current.quantity - soldQuantity),
    avgEntryPrice: current.avgEntryPrice,
    realized: round2(perUnit * soldQuantity),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function round8(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e8) / 1e8;
}
