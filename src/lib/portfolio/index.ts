/**
 * Pure math for the Investments module. Deliberately separate from
 * src/lib/accounting — holdings are unrealized market value, not cash,
 * and are never summed into Net Worth (see PRODUCT_VISION.md / schema.ts
 * comment on the `holdings` table for why).
 */

export interface HoldingLike {
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
}

export function marketValue(h: HoldingLike): number {
  return round2(h.quantity * h.currentPrice);
}

export function costBasis(h: HoldingLike): number {
  return round2(h.quantity * h.avgEntryPrice);
}

export function unrealizedPnL(h: HoldingLike): number {
  return round2(marketValue(h) - costBasis(h));
}

/** Returns 0 when cost basis is 0 (avoids divide-by-zero for a free/zero-cost position). */
export function unrealizedPnLPercent(h: HoldingLike): number {
  const basis = costBasis(h);
  if (basis === 0) return 0;
  return round2((unrealizedPnL(h) / basis) * 100);
}

export function portfolioTotals(holdings: HoldingLike[]) {
  const totalValue = round2(holdings.reduce((s, h) => s + marketValue(h), 0));
  const totalCost = round2(holdings.reduce((s, h) => s + costBasis(h), 0));
  const totalPnL = round2(totalValue - totalCost);
  const totalPnLPercent = totalCost === 0 ? 0 : round2((totalPnL / totalCost) * 100);
  return { totalValue, totalCost, totalPnL, totalPnLPercent };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
