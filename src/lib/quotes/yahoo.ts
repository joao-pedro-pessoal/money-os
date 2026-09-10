/**
 * Prices from Yahoo's chart endpoint.
 *
 * Added after Stooq answered 404 to every German listing — `sxr8.de`,
 * `aum5.de`, `500.fr`, all of them. Not "unknown symbol", which Stooq signals
 * with `N/D`, but the request itself failing, which means the fault was in the
 * choice of source rather than in the symbols.
 *
 * The symbols themselves were right. OpenFIGI returned SXR8, SNAW, XXSC, NQSE —
 * the genuine Xetra tickers for those funds. Only the place being asked was
 * wrong, so what this fixes is that one link in the chain.
 *
 * Yahoo suffixes by exchange the same way, with different letters: `.DE` is
 * Xetra, `.F` Frankfurt, `.L` London, `.PA` Paris. No key, no account.
 *
 * Pure — no I/O. The fetch belongs to the caller.
 */

export interface YahooQuote {
  symbol: string;
  price: number;
  currency: string | null;
  /** ISO day of the price, from the timestamp Yahoo attaches. */
  date: string;
}

export function yahooUrl(symbol: string): string {
  // One day of daily candles is all this needs; the meta block carries the
  // current price and the currency, which is the whole payload of interest.
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol.trim().toUpperCase()
  )}?interval=1d&range=1d`;
}

/**
 * The same endpoint, asked for a range instead of a day.
 *
 * `range` takes Yahoo's own vocabulary — `1mo`, `6mo`, `1y`, `5y`, `max`. The
 * benchmark needs whatever window the portfolio's own history covers, and
 * asking for more than that costs nothing but is thrown away by the comparison.
 */
export function yahooHistoryUrl(symbol: string, range: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol.trim().toUpperCase()
  )}?interval=1d&range=${encodeURIComponent(range)}`;
}

export interface YahooSeries {
  symbol: string;
  currency: string | null;
  /** One point per trading day with a close, oldest first. */
  points: { date: string; close: number }[];
}

/**
 * Reads a daily close series.
 *
 * `timestamp[]` and `indicators.quote[0].close[]` are the one place in this
 * codebase where reading two arrays by position is correct: neither carries an
 * identifier, and Yahoo defines them as parallel. CLAUDE.md's rule is about
 * arrays that *do* carry one — so the guard here is different, and it is that
 * the lengths must agree. When they don't, the pairing is guesswork and this
 * returns null rather than a series drifting by an unknown offset, which is
 * exactly the shape of the Hyperliquid bug.
 *
 * Nulls inside `close` are real and ordinary — a holiday, a halt, a fund that
 * did not trade. Those days are dropped. They are not zeros and must never be
 * read as a price of zero: a benchmark that touches zero for one day reports a
 * −100% period and then a recovery of several thousand percent.
 */
export function parseYahooHistory(payload: unknown): YahooSeries | null {
  const result = dig(payload, "chart.result.0");
  if (!result || typeof result !== "object") return null;

  const meta = dig(payload, "chart.result.0.meta") as Record<string, unknown> | undefined;
  const timestamps = dig(payload, "chart.result.0.timestamp");
  const closes = dig(payload, "chart.result.0.indicators.quote.0.close");

  if (!Array.isArray(timestamps) || !Array.isArray(closes)) return null;
  if (timestamps.length === 0) return null;
  if (timestamps.length !== closes.length) return null;

  const points: { date: string; close: number }[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const seconds = timestamps[i];
    const close = closes[i];
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) continue;
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) continue;
    points.push({
      date: new Date(seconds * 1000).toISOString().slice(0, 10),
      close,
    });
  }

  if (points.length === 0) return null;

  points.sort((a, b) => a.date.localeCompare(b.date));

  return {
    symbol: typeof meta?.symbol === "string" ? meta.symbol : "",
    currency: typeof meta?.currency === "string" ? meta.currency.toUpperCase() : null,
    points,
  };
}

const dig = (value: unknown, path: string): unknown => {
  let cursor: unknown = value;
  for (const part of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
};

/**
 * Reads the chart response.
 *
 * `regularMarketPrice` is the live or last-traded price; `previousClose` is the
 * fallback when the market has never opened today. Either is a real price for
 * a portfolio; neither is invented, which is the only line that matters.
 *
 * An unknown symbol comes back as `chart.error` with a 404, so a caller has to
 * treat the status as information rather than as a failure to log and forget.
 */
export function parseYahooChart(payload: unknown): YahooQuote | null {
  const meta = dig(payload, "chart.result.0.meta");
  if (!meta || typeof meta !== "object") return null;

  const m = meta as Record<string, unknown>;
  const raw =
    typeof m.regularMarketPrice === "number"
      ? m.regularMarketPrice
      : typeof m.previousClose === "number"
        ? m.previousClose
        : typeof m.chartPreviousClose === "number"
          ? m.chartPreviousClose
          : null;

  if (raw === null || !Number.isFinite(raw) || raw <= 0) return null;

  const symbol = typeof m.symbol === "string" ? m.symbol : "";
  const currency = typeof m.currency === "string" ? m.currency.toUpperCase() : null;

  /**
   * The timestamp is in seconds, and it is the market's clock rather than
   * ours. Kept as the date the price belongs to, so a figure fetched at
   * midnight isn't labelled with tomorrow.
   */
  const seconds =
    typeof m.regularMarketTime === "number"
      ? m.regularMarketTime
      : Math.floor(Date.now() / 1000);

  return {
    symbol,
    price: raw,
    currency,
    date: new Date(seconds * 1000).toISOString().slice(0, 10),
  };
}

/**
 * Yahoo's suffix for each exchange, and what it trades in.
 *
 * Same purpose as Stooq's: the suffix decides the currency, and the currency is
 * what makes a price right or wrong by the exchange rate.
 */
export const YAHOO_MARKETS: Record<string, { suffix: string; currency: string }> = {
  GY: { suffix: ".DE", currency: "EUR" }, // Xetra
  GR: { suffix: ".F", currency: "EUR" }, // Frankfurt
  GM: { suffix: ".MU", currency: "EUR" }, // Munich
  GS: { suffix: ".SG", currency: "EUR" }, // Stuttgart
  GD: { suffix: ".DU", currency: "EUR" }, // Düsseldorf
  GB: { suffix: ".BE", currency: "EUR" }, // Berlin
  GH: { suffix: ".HM", currency: "EUR" }, // Hamburg
  LN: { suffix: ".L", currency: "GBP" },
  FP: { suffix: ".PA", currency: "EUR" },
  NA: { suffix: ".AS", currency: "EUR" },
  IM: { suffix: ".MI", currency: "EUR" },
  SW: { suffix: ".SW", currency: "CHF" },
  // The Americans need no suffix at all.
  US: { suffix: "", currency: "USD" },
  UN: { suffix: "", currency: "USD" },
  UW: { suffix: "", currency: "USD" },
  UQ: { suffix: "", currency: "USD" },
};

/**
 * How old a price may be before it stops being a price.
 *
 * Ten calendar days covers a long weekend, a public holiday and a fund that
 * simply did not trade, without covering a listing that stopped trading in
 * 2021. Everything about a dead venue's last print looks correct — right
 * instrument, right currency, plausible number — and the date is the only field
 * that gives it away, which is why it was the one field nothing looked at.
 */
export const MAX_PRICE_AGE_DAYS = 10;

/**
 * Whole days between two ISO dates, counted on the calendar rather than by
 * dividing milliseconds — the same arithmetic that put weekly budgets a week
 * behind when a clock change made a day 23 hours long.
 */
export function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * True when a quote is too old to describe what something is worth now.
 *
 * An unreadable date counts as stale. A price that cannot say when it happened
 * is not a price you can value a portfolio with, and defaulting the other way
 * is how the unreadable case becomes the silent case.
 */
export function quoteIsStale(
  priceDate: string,
  today: string,
  maxAgeDays: number = MAX_PRICE_AGE_DAYS
): boolean {
  const age = daysBetween(priceDate, today);
  if (age === null) return true;
  return age > maxAgeDays;
}

export function yahooSymbol(ticker: string, exchCode: string): string | null {
  const market = YAHOO_MARKETS[exchCode.trim().toUpperCase()];
  if (!market) return null;
  return `${ticker.trim().toUpperCase()}${market.suffix}`;
}
