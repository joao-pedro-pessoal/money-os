/**
 * Telling a symbol the app guessed from one you chose.
 *
 * This matters for exactly one operation: undoing an automatic lookup that got
 * it wrong. A guess is disposable and a choice is not, so throwing away the
 * wrong set is worse than useless — it silently deletes a decision you made.
 *
 * It lives here, with tests, because the first version of it was a regular
 * expression written from memory inside a database action. It matched the
 * Stooq spelling and not the Yahoo one, so the button that was supposed to
 * clear eleven wrong prices cleared none of them, reported success, and left
 * the wrong numbers on screen. A predicate this load-bearing has no business
 * being unexamined.
 */

/** How a Yahoo match is recorded, so the two sources stay distinguishable. */
export const YAHOO_PREFIX = "yahoo:";

/** The markets `candidateSymbols` can produce a Stooq symbol for. */
const STOOQ_SUFFIXES = ["de", "uk", "fr", "us"] as const;

/**
 * True when this app chose the symbol rather than a person.
 *
 * Both spellings the lookup can produce:
 *  - `yahoo:SXR8.DE` — a Yahoo match, prefixed at the point it is stored
 *  - `sxr8.de` — a Stooq match, lowercased with a known market suffix
 *
 * Anything else is treated as yours and left alone. Typing `sxr8.de` by hand
 * would be read as automatic, which is the one collision here; it is the safe
 * direction to be wrong in, because the cost is re-entering a symbol rather
 * than losing one you cannot recover.
 */
export function wasFoundAutomatically(symbol: string | null | undefined): boolean {
  if (typeof symbol !== "string") return false;

  const clean = symbol.trim();
  if (clean === "") return false;

  if (clean.toLowerCase().startsWith(YAHOO_PREFIX)) return true;

  // Stooq's spelling: no uppercase, no prefix, and a market this app knows.
  if (clean !== clean.toLowerCase()) return false;

  const dot = clean.lastIndexOf(".");
  if (dot <= 0) return false;

  const suffix = clean.slice(dot + 1);
  return (STOOQ_SUFFIXES as readonly string[]).includes(suffix);
}

/**
 * The symbol without its bookkeeping, for showing to a person.
 *
 * `yahoo:SXR8.DE` is a storage detail; the part worth reading is the listing,
 * because comparing it against your broker's screen is how a wrong match gets
 * caught.
 */
export function displaySymbol(symbol: string | null | undefined): string | null {
  if (typeof symbol !== "string") return null;

  const clean = symbol.trim();
  if (clean === "") return null;

  return clean.toLowerCase().startsWith(YAHOO_PREFIX)
    ? clean.slice(YAHOO_PREFIX.length)
    : clean;
}
