/**
 * A readable label for an instrument whose stored symbol is a full legal name.
 *
 * The broker CSV route has no ticker to import, so `holdings.symbol` ends up
 * holding whatever the statement called the thing:
 *
 *   "iShares VII plc - iShares Core S&P 500 UCITS ETF USD (Acc)"
 *
 * Fifty-eight characters, of which about eight identify the fund. In a table
 * column that wraps mid-word, twelve of those rows are unreadable — which is
 * the whole reason this exists.
 *
 * This never replaces the stored symbol and never feeds a lookup: a shortened
 * name is for the eye only. Anything that has to *match* an instrument uses the
 * ISIN or the quote symbol, because two funds can shorten to the same words.
 */

/**
 * Umbrella wrappers and share-class noise, removed as whole words.
 *
 * Everything here is true of thousands of funds and therefore distinguishes
 * none of them: every row in the table is a UCITS ETF.
 */
const NOISE = [
  "ucits",
  "etf",
  "etc",
  "plc",
  "sicav",
  "acc",
  "dist",
  "inc",
];

/**
 * "cap" is deliberately absent from that list.
 *
 * It reads as a share-class marker and is one, occasionally. It is also the
 * second half of "Small Cap" and "Large Cap", which is the entire distinction
 * between two funds tracking the same index — and removing it turned "MSCI
 * World Small Cap" into "MSCI World Small", which is not a fund.
 */

/** Trailing currency and hedging markers: "USD", "hEUR", "EUR-hedged". */
const CURRENCY_MARKER = /^(h|hedged-)?(usd|eur|gbp|chf|jpy|cad|aud|sek|nok|dkk)(-hedged|-h)?$/i;

/**
 * Issuers, dropped only from the front.
 *
 * "iShares Core S&P 500" and "Amundi S&P 500" track the same index, so the
 * issuer is the least useful word in a column you are scanning for *what* you
 * own. It is kept in the full name, which stays one hover away.
 */
const ISSUERS = [
  "ishares",
  "amundi",
  "vanguard",
  "ubs",
  "hsbc",
  "spdr",
  "xtrackers",
  "invesco",
  "lyxor",
  "fidelity",
  "vaneck",
  "wisdomtree",
  "franklin",
  "jpmorgan",
  "jpm",
  "bnp",
  "blackrock",
  "deka",
  "l&g",
  "legal",
];

/** Share-class suffixes in brackets: "(Acc)", "(C)", "(Dist)", "(ACC)". */
const BRACKETED_CLASS = /\((acc|dist|inc|c|d|a|1c|1d|usd|eur|gbp|chf)\)/gi;

function words(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/**
 * The most informative segment of a name split on " - ".
 *
 * "Amundi Index Solutions - Amundi S&P 500 UCITS ETF - EUR (C)" is umbrella,
 * fund, share class. The fund is neither the first nor the last, so position
 * cannot pick it — length can, and does, because the fund name is the part
 * carrying the index, the region and the cap size.
 */
function mainSegment(value: string): string {
  const parts = value.split(/\s+-\s+/).filter((p) => p.trim().length > 0);
  if (parts.length < 2) return value;
  return parts.reduce((longest, p) => (p.trim().length > longest.trim().length ? p : longest));
}

/**
 * A short, human label for an instrument. Never empty, never longer than the
 * input, and unchanged when there is nothing safe to remove.
 *
 * A ticker passes through untouched — there is nothing to shorten about "BTC" —
 * except for the `_EQ` suffix Trading 212 appends to its own codes.
 */
export function shortName(symbol: string | null | undefined): string {
  const original = (symbol ?? "").trim();
  if (!original) return "";

  // Trading 212's internal codes: "MVOLI_EQ", "PHAGa_EQ".
  const ticker = original.match(/^([A-Za-z0-9.]{1,12})_EQ$/);
  if (ticker) return ticker[1];

  let value = mainSegment(original).replace(BRACKETED_CLASS, " ");

  let kept = words(value).filter((w) => {
    const bare = w.replace(/[(),.]/g, "").toLowerCase();
    if (!bare) return false;
    if (NOISE.includes(bare)) return false;
    if (CURRENCY_MARKER.test(bare)) return false;
    return true;
  });

  // Issuer only at the front, and never as the last word standing: "UBS" alone
  // is a worse label than "UBS", which is to say dropping it would leave
  // nothing at all.
  while (kept.length > 1 && ISSUERS.includes(kept[0].replace(/[(),.]/g, "").toLowerCase())) {
    kept = kept.slice(1);
  }

  value = kept.join(" ").replace(/\s+/g, " ").replace(/^[\s\-–—,]+|[\s\-–—,]+$/g, "");

  // Removing everything means the name was entirely words we call noise, which
  // says the rule is wrong for this row, not that the row has no name.
  if (value.length < 2) return original;
  return value.length > original.length ? original : value;
}
