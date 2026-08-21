/**
 * Turning an ISIN into tickers, so nobody has to type one.
 *
 * OpenFIGI is Bloomberg's open identifier service. It is free, needs no
 * account, and exists precisely to answer "what is this ISIN called on each
 * exchange" — which is the one step that made automatic pricing impossible.
 * With it the chain closes: ISIN from your statement, ticker from OpenFIGI,
 * price from Stooq.
 *
 * It returns one entry per listing, which is the same many-to-one problem as
 * before rather than a solution to it. What changes is that the candidates can
 * now be *tried*: a symbol either returns a price in the currency you paid in
 * or it doesn't, and that test is far more reliable than any guess about which
 * exchange code means what.
 *
 * Pure — no I/O. The request belongs to the caller.
 */

export const OPENFIGI_URL = "https://api.openfigi.com/v3/mapping";

/** One request per ISIN; the service takes a batch and answers in order. */
export function figiRequestBody(isins: readonly string[]): string {
  return JSON.stringify(isins.map((idValue) => ({ idType: "ID_ISIN", idValue })));
}

export interface FigiListing {
  ticker: string;
  /** Bloomberg's two-letter exchange code — "GY" for Xetra, "LN" for London. */
  exchCode: string | null;
  name: string | null;
  securityType: string | null;
}

/**
 * Exchange codes worth translating into a Stooq market.
 *
 * Deliberately partial. A code that isn't here produces no candidate rather
 * than a guessed one, because a wrong market means a wrong currency and a wrong
 * currency means a plausible price that is out by the exchange rate.
 */
const EXCHANGE_TO_STOOQ: Record<string, { suffix: string; currency: string }> = {
  // German venues — where a Trade Republic customer's ETFs actually trade.
  GY: { suffix: ".de", currency: "EUR" }, // Xetra
  GR: { suffix: ".de", currency: "EUR" }, // Frankfurt
  GM: { suffix: ".de", currency: "EUR" }, // Munich
  GS: { suffix: ".de", currency: "EUR" }, // Stuttgart
  GD: { suffix: ".de", currency: "EUR" }, // Düsseldorf
  GB: { suffix: ".de", currency: "EUR" }, // Berlin
  GH: { suffix: ".de", currency: "EUR" }, // Hamburg
  // Elsewhere in Europe.
  LN: { suffix: ".uk", currency: "GBP" },
  FP: { suffix: ".fr", currency: "EUR" },
  // The Americans.
  US: { suffix: ".us", currency: "USD" },
  UN: { suffix: ".us", currency: "USD" },
  UW: { suffix: ".us", currency: "USD" },
  UQ: { suffix: ".us", currency: "USD" },
};

/**
 * Reads OpenFIGI's answer.
 *
 * A missing identifier comes back as `{ warning: … }` rather than an error, so
 * "not found" has to be recognised rather than thrown. Entries with no ticker
 * are dropped: a listing you can't name is a listing you can't price.
 */
export function parseFigiMapping(payload: unknown): FigiListing[][] {
  if (!Array.isArray(payload)) return [];

  return payload.map((entry) => {
    const data = (entry as { data?: unknown })?.data;
    if (!Array.isArray(data)) return [];

    return data
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          ticker: typeof r.ticker === "string" ? r.ticker.trim() : "",
          exchCode: typeof r.exchCode === "string" ? r.exchCode.trim() : null,
          name: typeof r.name === "string" ? r.name.trim() : null,
          securityType: typeof r.securityType === "string" ? r.securityType.trim() : null,
        };
      })
      .filter((l) => l.ticker !== "");
  });
}

export interface SymbolCandidate {
  /** Stooq's spelling. */
  symbol: string;
  currency: string;
  exchCode: string;
  ticker: string;
}

/**
 * Stooq symbols worth trying, best first.
 *
 * "Best" means the currency you paid in: a euro position wants the German
 * listing, and trying London first would find a price that is wrong by the
 * exchange rate — and *look* right, which is worse than finding nothing.
 *
 * Deduplicated, because a fund listed on five German venues yields the same
 * Stooq symbol five times and there is no sense asking five times.
 */
/**
 * Which venue to believe when several carry the same fund.
 *
 * Xetra is where a German-listed ETF actually trades; Berlin and Hamburg carry
 * the same ISIN and may not have printed a price in years. Since every German
 * venue collapses to one Stooq symbol, whichever listing survived that collapse
 * decided the exchange asked for a price — and it was decided by OpenFIGI's
 * ordering, which is to say by nothing.
 *
 * Lower is better. Unlisted venues sort last but are still tried, because a
 * price from a quiet exchange beats no price, and the staleness check now
 * refuses the ones that are quiet because they are dead.
 */
const VENUE_RANK: Record<string, number> = {
  GY: 0, // Xetra — the real market for these
  GR: 1, // Frankfurt
  GS: 2, // Stuttgart
  GM: 3, // Munich
  GD: 4, // Düsseldorf
  GB: 5, // Berlin
  GH: 6, // Hamburg
  FP: 1,
  LN: 1,
  US: 0,
  UN: 1,
  UW: 1,
  UQ: 1,
};

const rankOf = (exchCode: string): number => VENUE_RANK[exchCode.toUpperCase()] ?? 90;

export function candidateSymbols(
  listings: readonly FigiListing[],
  preferCurrency: string
): SymbolCandidate[] {
  const wanted = preferCurrency.trim().toUpperCase();
  const seen = new Set<string>();
  const candidates: SymbolCandidate[] = [];

  /**
   * Sorted before deduplicating, not after.
   *
   * The duplicate that survives carries its exchange code forward, and that
   * code is what picks the Yahoo listing. Deduplicating first meant the
   * surviving venue was whichever one OpenFIGI happened to list first — so the
   * ordering below could put Xetra top and still be asking Hamburg for the
   * price.
   */
  const ordered = [...listings].sort((a, b) => {
    const aMarket = a.exchCode ? EXCHANGE_TO_STOOQ[a.exchCode.toUpperCase()] : undefined;
    const bMarket = b.exchCode ? EXCHANGE_TO_STOOQ[b.exchCode.toUpperCase()] : undefined;

    const aCurrency = aMarket?.currency === wanted ? 0 : 1;
    const bCurrency = bMarket?.currency === wanted ? 0 : 1;
    if (aCurrency !== bCurrency) return aCurrency - bCurrency;

    return rankOf(a.exchCode ?? "") - rankOf(b.exchCode ?? "");
  });

  for (const listing of ordered) {
    const market = listing.exchCode ? EXCHANGE_TO_STOOQ[listing.exchCode.toUpperCase()] : undefined;
    if (!market) continue;

    const symbol = `${listing.ticker.toLowerCase()}${market.suffix}`;
    if (seen.has(symbol)) continue;
    seen.add(symbol);

    candidates.push({
      symbol,
      currency: market.currency,
      exchCode: listing.exchCode!.toUpperCase(),
      ticker: listing.ticker,
    });
  }

  // The right currency first, then the venue most likely to be trading today.
  // Alphabetical order used to break the tie, which is how `sxr8.de` could
  // arrive carrying Berlin's exchange code.
  return candidates.sort((a, b) => {
    const aMatch = a.currency === wanted ? 0 : 1;
    const bMatch = b.currency === wanted ? 0 : 1;
    return aMatch - bMatch || rankOf(a.exchCode) - rankOf(b.exchCode) || a.symbol.localeCompare(b.symbol);
  });
}
