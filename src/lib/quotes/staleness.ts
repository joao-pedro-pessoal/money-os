/**
 * Which prices are worth asking for again.
 *
 * The scheduler runs every fifteen minutes because that is the right cadence
 * for a connected exchange, where the balance genuinely moves. A quoted price
 * is not that: it comes from Stooq or Yahoo, neither of which is an API anyone
 * contracted, and asking them for eleven instruments ninety-six times a day is
 * both wasteful and rude.
 *
 * So the schedule decides how often to *look*, and this decides what is
 * actually due. Separated because they are different questions and the second
 * one is worth being able to test.
 *
 * Pure — no DB, no fetch.
 */

/**
 * How long a fetched price stays good enough.
 *
 * An hour. Long enough that a fifteen-minute scheduler asks once every four
 * passes, short enough that a portfolio opened at lunchtime is not showing
 * this morning. Both sources publish far less often than this anyway — Stooq
 * is daily closes — so a shorter window would buy nothing but requests.
 *
 * Not to be confused with `MAX_PRICE_AGE_DAYS` in `./yahoo`, which asks
 * something else entirely: whether a price is too old to be *believed*. This
 * one asks whether it is old enough to be *replaced*.
 */
export const REPRICE_AFTER_MINUTES = 60;

export interface Priceable {
  /** Null while nothing has ever priced it. */
  lastPriceUpdate: Date | null;
  /** Null when no source has been chosen, which makes it unaskable. */
  quoteSymbol: string | null;
}

/**
 * Whether this holding should be asked about now.
 *
 * A holding nobody has priced is always due: never asked is not the same as
 * asked recently, and starting the clock at "now" would leave it unpriced
 * until an hour after it was created.
 *
 * A holding with no quote symbol is never due. There is nothing to ask and
 * nobody to ask it of — its price is whatever was typed in by hand, and
 * overwriting that would be replacing a stated fact with an absence.
 */
export function needsRepricing(
  holding: Priceable,
  now: Date,
  afterMinutes: number = REPRICE_AFTER_MINUTES
): boolean {
  if (holding.quoteSymbol === null) return false;
  if (holding.lastPriceUpdate === null) return true;

  const minutes = (now.getTime() - holding.lastPriceUpdate.getTime()) / 60_000;
  return minutes >= afterMinutes;
}

/**
 * How stale the freshest thing is, in whole minutes, or null when nothing has
 * ever been priced.
 *
 * Reported so a sync can say what it did rather than only that it ran — "11
 * prices, oldest 15 days" is a sentence someone can act on, and it is how the
 * fifteen-day gap that prompted this was found.
 */
export function oldestPriceAgeMinutes(holdings: readonly Priceable[], now: Date): number | null {
  const dated = holdings
    .filter((h) => h.quoteSymbol !== null && h.lastPriceUpdate !== null)
    .map((h) => now.getTime() - h.lastPriceUpdate!.getTime());

  if (dated.length === 0) return null;
  return Math.floor(Math.max(...dated) / 60_000);
}
