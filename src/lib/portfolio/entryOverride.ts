/**
 * Saying what a synced position actually cost you.
 *
 * A venue's average entry is not always the one you mean. Coins moved in from
 * elsewhere arrive carrying the venue's basis rather than yours, a position
 * rebuilt from a statement carries whatever the statement said, and some venues
 * quote an average that excludes fees. The override lets you correct it.
 *
 * The hard part is not storing the number, it is what happens to the P&L.
 *
 * **The venue's figure wins unless this file can reproduce it.** That is the
 * same rule `lib/trading/realised.ts` follows for realised results, and it is
 * tested here per position rather than assumed: if `(mark − entry) × size`
 * gives back the venue's own unrealised figure, then the arithmetic is
 * understood and the same arithmetic can be run again with your entry. If it
 * does not, something is in that number which the prices do not carry, and
 * restating it would be inventing one.
 *
 * On live data that split is real and not hypothetical. Eight positions
 * reproduce to the cent. Two — Trading 212's IGLA and MVOL — are quoted in
 * dollars inside a euro account, and their P&L reconstructs 0.08 and 0.07 away
 * from what the venue says, because it contains the currency's move between
 * opening and now. Current prices cannot contain that; only the venue knows the
 * rate on the day. So those two take the new entry on screen and keep the
 * venue's P&L, and the interface says why.
 *
 * Pure — no DB, no React.
 */

/** How close a reconstruction must be before it counts as understood. */
const CENT = 0.011;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PositionFigures {
  size: number;
  /** The venue's average entry, in the instrument's own currency. */
  entryPrice: number | null;
  markPrice: number | null;
  /** The venue's unrealised result, in the account's currency. */
  unrealizedPnl: number | null;
  side: string | null;
}

export type PnlSource =
  /** The venue's own figure, untouched. */
  | "venue"
  /** Recomputed from your entry, by arithmetic proven against the venue's. */
  | "yours"
  /**
   * Your entry is shown, but the result is still the venue's.
   *
   * Their figure could not be reproduced from their own prices, so it holds
   * something those prices do not — an exchange-rate move between opening and
   * now is the case that occurs here. Restating it would be guessing.
   */
  | "entry-only";

export interface EffectivePosition {
  /** What to show as the entry: yours where you gave one. */
  entryPrice: number | null;
  /** What to show as the unrealised result. */
  unrealizedPnl: number | null;
  pnlSource: PnlSource;
  /** True while an override is in force, whatever happened to the P&L. */
  overridden: boolean;
}

/**
 * Whether the venue's own numbers explain each other.
 *
 * Exported because it is the whole basis of the decision below, and a claim
 * that specific deserves to be testable on its own.
 */
export function venuePnlIsReproducible(p: PositionFigures): boolean {
  if (p.entryPrice === null || p.markPrice === null || p.unrealizedPnl === null) return false;

  const perUnit =
    p.side === "short" ? p.entryPrice - p.markPrice : p.markPrice - p.entryPrice;
  return Math.abs(perUnit * p.size - p.unrealizedPnl) <= CENT;
}

/**
 * The position as it should be read, given what you have said about it.
 *
 * With no override this is the venue's reading, unchanged — including a null
 * P&L, which stays null rather than becoming zero.
 */
export function applyEntryOverride(
  p: PositionFigures,
  override: number | null
): EffectivePosition {
  if (override === null) {
    return {
      entryPrice: p.entryPrice,
      unrealizedPnl: p.unrealizedPnl,
      pnlSource: "venue",
      overridden: false,
    };
  }

  if (p.markPrice === null || !venuePnlIsReproducible(p)) {
    return {
      entryPrice: override,
      unrealizedPnl: p.unrealizedPnl,
      pnlSource: "entry-only",
      overridden: true,
    };
  }

  const perUnit = p.side === "short" ? override - p.markPrice : p.markPrice - override;
  return {
    entryPrice: override,
    unrealizedPnl: round2(perUnit * p.size),
    pnlSource: "yours",
    overridden: true,
  };
}

/** What the screen says about where a figure came from. */
export function describePnlSource(source: PnlSource): string | null {
  switch (source) {
    case "venue":
      return null;
    case "yours":
      return "worked out from the entry you set, not the platform's";
    case "entry-only":
      return "still the platform's result — it holds a currency move between opening and now that today's prices cannot reproduce, so your entry changes what is shown above it and not this";
  }
}

/**
 * What a spot balance cost, given what you said and what the venue said.
 *
 * The override is stored per unit — the same shape as the one on an open
 * position, so one field means one thing everywhere — and multiplied out here.
 *
 * A spot balance is the easy case, and worth saying why: it has no leverage, no
 * funding and no entry-date exchange rate hiding inside a figure. Value minus
 * cost is the whole of its result, so an entry you set restates it exactly.
 * That is not true of an open position, which is why `applyEntryOverride`
 * above has to test the venue's arithmetic before trusting its own.
 *
 * Null when neither you nor the venue says. Never zero: a cost nobody stated
 * is not a cost of nothing, and `value − 0` reports the whole holding as
 * profit.
 */
export function spotCostBasis(
  total: number,
  venueCostBasis: number | null,
  override: number | null
): number | null {
  if (override !== null) return round2(override * total);
  return venueCostBasis;
}

/**
 * What the venue said each unit cost, from the total it reported.
 *
 * Null when it reported none, or when there is nothing held to divide by —
 * a zero balance has no price per unit, and dividing would be an infinity
 * rendered as a number.
 */
export function venueEntryPerUnit(total: number, venueCostBasis: number | null): number | null {
  if (venueCostBasis === null || total === 0) return null;
  return venueCostBasis / total;
}
