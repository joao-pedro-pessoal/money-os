/**
 * Listings checked by hand, because the automatic route kept choosing badly.
 *
 * OpenFIGI answers "where does this ISIN trade" with every venue that carries
 * it, and several of those venues have not printed a price in years. Picking
 * between them by ordering — any ordering — is guesswork, and the guesses were
 * wrong in the worst possible way: a real price, in the right currency, for the
 * right fund, from 2021.
 *
 * So the funds actually held here were looked up one at a time and their Xetra
 * tickers written down. This is not a price list; nothing here is a number.
 * It answers only "what is this called on the exchange that trades it", which
 * is the question that kept being answered wrongly. The price is still fetched
 * live, and still has to pass the currency and staleness checks — being in this
 * table earns a symbol no trust it hasn't proved.
 *
 * An ISIN that is not here falls back to OpenFIGI, so this is a shortcut rather
 * than a gate, and a wrong entry costs a failed lookup rather than a wrong
 * price.
 */

export interface KnownListing {
  /** Yahoo's spelling, including the market suffix. */
  symbol: string;
  /** What that listing trades in, so a mismatch is caught before the request. */
  currency: string;
  /** For anyone auditing this table against a broker's screen. */
  name: string;
}

const KNOWN: Record<string, KnownListing> = {
  // — Accumulating UCITS ETFs on Xetra, which is where a European broker's
  //   customers actually hold them.
  IE00B5BMR087: {
    symbol: "SXR8.DE",
    currency: "EUR",
    name: "iShares Core S&P 500 UCITS ETF USD (Acc)",
  },
  LU1681048804: {
    symbol: "AUM5.DE",
    currency: "EUR",
    name: "Amundi S&P 500 Swap UCITS ETF EUR (C)",
  },
  IE00B53SZB19: {
    symbol: "SXRV.DE",
    currency: "EUR",
    name: "iShares NASDAQ 100 UCITS ETF USD (Acc)",
  },
  IE00BYVQ9F29: {
    symbol: "NQSE.DE",
    currency: "EUR",
    name: "iShares NASDAQ 100 UCITS ETF EUR Hedged (Acc)",
  },
  IE00BF4RFH31: {
    symbol: "IUSN.DE",
    currency: "EUR",
    name: "iShares MSCI World Small Cap UCITS ETF USD (Acc)",
  },
  IE00BFNM3J75: {
    symbol: "SNAW.DE",
    currency: "EUR",
    name: "iShares MSCI World Screened UCITS ETF USD (Acc)",
  },
  LU0322253906: {
    symbol: "XXSC.DE",
    currency: "EUR",
    name: "Xtrackers MSCI Europe Small Cap UCITS ETF 1C",
  },
  IE000KCS7J59: {
    symbol: "H4Z3.DE",
    currency: "EUR",
    name: "HSBC MSCI Emerging Markets UCITS ETF USD (Acc)",
  },
  LU1600334798: {
    symbol: "UIMF.DE",
    currency: "EUR",
    name: "UBS Core MSCI Europe UCITS ETF hEUR acc",
  },

  /**
   * Trade Republic's crypto identifiers are not ISINs at all.
   *
   * `XF000BTC0017` has no issuer, no exchange and no OpenFIGI entry — it is a
   * house code that happens to fit the shape. Nothing could ever have priced it
   * automatically, which is why it sat at cost while everything around it
   * moved.
   */
  XF000BTC0017: { symbol: "BTC-EUR", currency: "EUR", name: "Bitcoin" },
  XF000ETH0019: { symbol: "ETH-EUR", currency: "EUR", name: "Ethereum" },

  /**
   * Listed in Toronto and priced in Canadian dollars.
   *
   * Recorded rather than omitted: knowing that a position cannot be priced in
   * the currency it was bought in is a better answer than searching for it
   * again every time and failing.
   */
  CA25537R1091: { symbol: "DFN.TO", currency: "CAD", name: "Dividend 15 Split Corp" },
};

/** The listing for an ISIN, or nothing if it was never checked. */
export function knownListingFor(isin: string | null | undefined): KnownListing | null {
  if (typeof isin !== "string") return null;
  return KNOWN[isin.trim().toUpperCase()] ?? null;
}

/** Every ISIN in the table, for tests and for showing what is covered. */
export function knownIsinCount(): number {
  return Object.keys(KNOWN).length;
}
