/**
 * The currencies you actually think in.
 *
 * Net Worth has one base currency, and that is deliberate: totals have to be
 * comparable over time, and a figure that silently changes denomination is
 * worse than useless. But *reading* the same money in another currency is a
 * different act from changing what the app stores, and this is what makes the
 * first possible without the second.
 *
 * A short list, chosen by you, rather than every currency with a rate: a
 * dropdown of 170 entries is a worse answer to "show me this in dollars" than
 * two buttons.
 *
 * Pure — no DB, no network.
 */

/** Stored as a comma-separated string in app settings, so no migration. */
export function parseFavourites(raw: string | null | undefined, base: string): string[] {
  const listed = (raw ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c));

  // The base currency is always available, whether it was saved or not: it is
  // the one denomination every stored figure is already comparable in.
  const withBase = [base.toUpperCase(), ...listed];
  return [...new Set(withBase)];
}

export function serialiseFavourites(currencies: readonly string[], base: string): string {
  return parseFavourites(currencies.join(","), base)
    .filter((c) => c !== base.toUpperCase())
    .join(",");
}

/**
 * The currency to display in, given what the URL asked for.
 *
 * Falls back to the base rather than erroring: a stale bookmark or a currency
 * removed from the favourites should show you your money, not a broken page.
 * It also refuses anything not on the list — otherwise a hand-edited URL could
 * ask for a conversion with no rate and quietly render nulls.
 */
export function resolveDisplayCurrency(
  requested: string | null | undefined,
  favourites: readonly string[],
  base: string
): string {
  const wanted = (requested ?? "").trim().toUpperCase();
  if (wanted === "") return base.toUpperCase();
  return favourites.includes(wanted) ? wanted : base.toUpperCase();
}

/**
 * True when a figure shown in this currency is a conversion rather than the
 * stored value, so the interface can say so.
 *
 * Worth being explicit about: a converted total moves when rates move, even if
 * nothing about your money changed.
 */
export function isConverted(display: string, base: string): boolean {
  return display.toUpperCase() !== base.toUpperCase();
}
