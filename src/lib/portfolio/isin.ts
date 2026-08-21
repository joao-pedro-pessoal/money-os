/**
 * The ISIN, validated rather than trusted.
 *
 * An ISIN is the key that joins a statement row to a price, a dividend and a
 * position. One malformed value creates a phantom instrument that matches
 * nothing, holds a slice of the portfolio and never gets a quote — visible only
 * as a total that's quietly too low.
 *
 * Its own module, and not part of `quotes.ts`, so the statement importer can
 * use it without importing anything that imports the importer.
 *
 * Pure — no DB, no I/O.
 */

/**
 * Twelve characters: two-letter country code, nine alphanumeric, one check
 * digit — and the check digit has to agree, which is what makes this worth
 * doing at all.
 */
export function isValidIsin(raw: string | null | undefined): boolean {
  const isin = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;

  // Letters expand to two digits: A = 10 … Z = 35.
  const digits = [...isin]
    .map((c) => (c >= "A" && c <= "Z" ? String(c.charCodeAt(0) - 55) : c))
    .join("");

  // Luhn, right to left. The rightmost character is the check digit itself, so
  // doubling starts on the one immediately left of it.
  let sum = 0;
  let double = true;
  for (let i = digits.length - 2; i >= 0; i--) {
    const d = Number(digits[i]) * (double ? 2 : 1);
    sum += d > 9 ? d - 9 : d;
    double = !double;
  }

  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/**
 * An ISIN in canonical form, or null.
 *
 * Returns null for anything that doesn't validate, rather than passing a
 * malformed value through in a tidier case. A wrong key that looks right is
 * worse than no key: no key is visible, a wrong key just fails to match.
 */
export function normaliseIsin(raw: string | null | undefined): string | null {
  const isin = (raw ?? "").trim().toUpperCase();
  return isValidIsin(isin) ? isin : null;
}
