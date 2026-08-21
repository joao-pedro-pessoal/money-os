/**
 * Closing prices from Stooq.
 *
 * Chosen over the alternatives for one reason that matters more than features:
 * **no account, no key, no signup.** It serves a CSV over plain HTTP and covers
 * the German exchanges, which is where the ETFs a Trade Republic customer holds
 * actually trade. Every other free option — API Ninjas, EODHD, Financial
 * Modeling Prep — wants a key, and a key is a thing to store, rotate and
 * eventually find expired.
 *
 * What it does not do is map an ISIN to a symbol. That step stays manual and
 * happens once per instrument, which is the right shape anyway: choosing the
 * listing chooses the currency, and getting that wrong prices a euro position
 * off a London quote — wrong by the exchange rate and entirely plausible.
 *
 * Daily closes, not live prices. Deliberate: a portfolio tracker needs to know
 * what things are worth, and anyone who needs the price this second is looking
 * at their broker's app, not at this.
 *
 * Pure — no I/O. The fetch belongs to the caller.
 */

export interface StooqQuote {
  symbol: string;
  /** ISO day of the close. */
  date: string;
  close: number;
}

/**
 * Where to ask for one symbol.
 *
 * `f=sd2t2ohlcv` selects symbol, date, time, OHLC and volume; `h` asks for a
 * header row, which is what makes the response parseable rather than guessable.
 */
export function stooqUrl(symbol: string): string {
  const clean = symbol.trim().toLowerCase();
  return `https://stooq.com/q/l/?s=${encodeURIComponent(clean)}&f=sd2t2ohlcv&h&e=csv`;
}

/**
 * Reads the one-line CSV Stooq answers with.
 *
 * An unknown symbol comes back as the string `N/D` in every field rather than
 * as an error, so "not found" and "found, worth nothing" look identical unless
 * this checks. Returning null for it is the difference between a missing price
 * and a price of zero — and a price of zero would quietly delete a position
 * from your portfolio.
 */
export function parseStooqCsv(text: string): StooqQuote | null {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const cells = lines[1].split(",").map((c) => c.trim());

  const at = (name: string): string | null => {
    const index = headers.indexOf(name);
    return index === -1 ? null : (cells[index] ?? null);
  };

  const symbol = at("symbol");
  const date = at("date");
  const close = at("close");

  // The "not found" sentinel, in any of the fields it appears in.
  if (!symbol || !date || !close) return null;
  if ([symbol, date, close].some((v) => v.toUpperCase() === "N/D")) return null;

  const value = Number(close);
  if (!Number.isFinite(value) || value <= 0) return null;

  return { symbol: symbol.toUpperCase(), date, close: value };
}

/**
 * Symbols worth suggesting for a European instrument.
 *
 * Stooq suffixes by market: `.de` for the German exchanges, `.uk` for London,
 * `.us` for the American ones. A ticker with no suffix is treated as Polish,
 * which is a silent way to price the wrong thing entirely.
 *
 * Suggestions only — nothing is chosen here, and each has to be checked against
 * a real quote before it means anything.
 */
export const STOOQ_MARKETS = [
  { suffix: ".de", label: "Germany (Xetra, gettex)", currency: "EUR" },
  { suffix: ".uk", label: "London", currency: "GBP" },
  { suffix: ".us", label: "United States", currency: "USD" },
  { suffix: ".fr", label: "Paris", currency: "EUR" },
  { suffix: ".hu", label: "Budapest", currency: "HUF" },
] as const;

export function suggestSymbols(ticker: string): string[] {
  const clean = ticker.trim().toLowerCase().replace(/\..*$/, "");
  if (clean === "") return [];
  return STOOQ_MARKETS.map((m) => `${clean}${m.suffix}`);
}

/**
 * The currency a Stooq symbol implies, from its market suffix.
 *
 * Returned so a price can be refused when it arrives in a currency the position
 * wasn't bought in, rather than silently mixing the two. Null when the suffix
 * isn't one this knows — in which case the currency is unknown, not assumed.
 */
export function currencyOfSymbol(symbol: string): string | null {
  const lower = symbol.trim().toLowerCase();
  return STOOQ_MARKETS.find((m) => lower.endsWith(m.suffix))?.currency ?? null;
}
