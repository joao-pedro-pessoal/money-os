/**
 * Things with no market price: a flat, a painting, a watch, a share in a
 * friend's startup, a car. Their value is whatever you last said it was, on
 * the day you said it.
 *
 * That figure goes into net worth like any other, so its age matters. A price
 * from a market is replaced every hour; a valuation typed in two years ago is
 * still sitting in the total as if it were today's. This says how old each one
 * is and when it is due to be looked at again — on a schedule that fits the
 * thing: a car loses value every month, a flat moves slowly, a startup is
 * worth what its last round said.
 *
 * Pure: no DB, no clock — `now` is passed in.
 */

/** Asset types valued by hand, and how many days a valuation is good for. */
export const REVALUE_AFTER_DAYS: Record<string, number> = {
  real_estate: 365,
  art: 365,
  collectible: 365,
  private_equity: 180,
  vehicle: 180,
};

export function isManuallyValued(assetType: string | null | undefined): boolean {
  return assetType != null && assetType in REVALUE_AFTER_DAYS;
}

export interface ValuationAge {
  /** Whole days since the value was last set. */
  days: number;
  /** True once `days` passes the type's limit. */
  due: boolean;
  /** The type's limit, for saying "valued yearly". */
  limit: number;
}

/**
 * How old a hand-set value is, or null when the question does not apply:
 * not a manually valued type, priced from a market (it has a quote symbol),
 * or never valued (then it is unpriced, which is said elsewhere).
 */
export function valuationAge(
  holding: { assetType: string | null; quoteSymbol: string | null; lastPriceUpdate: Date | null },
  now: Date
): ValuationAge | null {
  if (!isManuallyValued(holding.assetType) || holding.quoteSymbol || !holding.lastPriceUpdate) return null;
  const limit = REVALUE_AFTER_DAYS[holding.assetType!];
  const days = Math.max(0, Math.floor((now.getTime() - holding.lastPriceUpdate.getTime()) / 86_400_000));
  return { days, due: days > limit, limit };
}

/** "3 months", "1 year and 2 months": a valuation's age, for a sentence. */
export function ageLabel(days: number): string {
  if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.max(1, Math.round(days / 30.44));
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years > 0 ? `${years} year${years === 1 ? "" : "s"}` : "";
  const m = rest > 0 ? `${rest} month${rest === 1 ? "" : "s"}` : "";
  return [y, m].filter(Boolean).join(" and ");
}
