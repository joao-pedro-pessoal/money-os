/**
 * Pure parsing and signing for Binance's spot REST API.
 *
 * Shapes: https://developers.binance.com/docs/binance-spot-api-docs
 *
 * **Compose a symbol; never decompose one.** This is the opposite of the rule
 * the Kraken connector needed, and both come from the same principle: use the
 * direction the venue defines.
 *
 * Checked against the live `exchangeInfo` for all 3 645 spot symbols,
 * `symbol === baseAsset + quoteAsset` holds without a single exception — so
 * building `BTC` + `USDT` and looking the result up is exact, not a guess.
 *
 * Going the other way is not. Eight real symbols decompose two ways against
 * Binance's own list of quote assets: `BTCBUSD` is (BTC, BUSD) and also parses
 * as (BTCB, USD), and `LUNAEUR` as (LUNA, EUR) or (LUNAE, UR). Anything that
 * split a symbol string to find out what it prices would be right most of the
 * time and quietly wrong for those, which is the worst available outcome.
 *
 * Pure — no fetch, no DB.
 */

import { createHmac } from "crypto";

/** Every number arrives as a string. Only a real one gets through. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * The error Binance reported, or null.
 *
 * Errors arrive as `{"code":-2015,"msg":"Invalid API-key, IP, or permissions
 * for action."}`, usually with a 4xx but not dependably so. The message is kept
 * verbatim: -2015 in particular means one of three quite different things — bad
 * key, wrong IP, or missing permission — and only the venue's own words let
 * anyone tell which without guessing.
 */
export function binanceError(payload: unknown): string | null {
  const root = asRecord(payload);
  if (root === null) return null;

  const code = root.code;
  const message = root.msg;
  if (typeof code !== "number" || typeof message !== "string") return null;

  // Binance uses code 200 in a few informational replies; only a negative code
  // is an error in this API.
  return code < 0 ? `${message} (code ${code})` : null;
}

export interface BinanceBalance {
  asset: string;
  /** Everything held: free plus whatever is locked in resting orders. */
  total: number;
  /** Units locked in resting orders. */
  hold: number;
}

/**
 * Spot balances from `/api/v3/account`.
 *
 * Binance returns a row for every asset it has ever listed against the account,
 * the overwhelming majority at zero. Those are dropped: the venue measured and
 * found nothing, which is a measurement, and keeping them would bury four real
 * holdings in three hundred empty ones.
 */
export function parseAccountBalances(payload: unknown): BinanceBalance[] {
  const root = asRecord(payload);
  const rows = root === null ? null : root.balances;
  if (!Array.isArray(rows)) return [];

  const balances: BinanceBalance[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (record === null || typeof record.asset !== "string") continue;

    const free = num(record.free);
    const locked = num(record.locked);
    if (free === null && locked === null) continue;

    const total = (free ?? 0) + (locked ?? 0);
    if (total === 0) continue;

    balances.push({ asset: record.asset.toUpperCase(), total, hold: locked ?? 0 });
  }

  return balances.sort((a, b) => a.asset.localeCompare(b.asset));
}

/**
 * Last price per symbol, from `/api/v3/ticker/price`.
 *
 * One call for every symbol on the exchange — about 150 KB and 3 700 rows,
 * against 16 MB for `exchangeInfo`, which is why the price map is built from
 * this and pairs are composed rather than looked up.
 */
export function parseTickerPrices(payload: unknown): Map<string, number> {
  const prices = new Map<string, number>();
  if (!Array.isArray(payload)) return prices;

  for (const row of payload) {
    const record = asRecord(row);
    if (record === null || typeof record.symbol !== "string") continue;

    const price = num(record.price);
    // Zero is not a price. A delisted symbol still answers, and a holding
    // valued at nothing looks like a loss rather than like an absence.
    if (price === null || price <= 0) continue;

    prices.set(record.symbol.toUpperCase(), price);
  }
  return prices;
}

/**
 * Assets that are a dollar, and the order to try them in.
 *
 * An asset with no USDT market often has a USDC or FDUSD one, and all three
 * are pegged to the dollar closely enough that using them as the quote is
 * accurate to well under a cent on the dollar. They are tried in order of
 * how liquid their markets are, so the first hit is the best-priced one.
 *
 * This is a fact about a peg holding, not a currency conversion — the same
 * distinction `isCurrencyCode` draws in `src/lib/fx`.
 */
export const DOLLAR_QUOTES = ["USDT", "USDC", "FDUSD", "BUSD"] as const;

/**
 * What one unit of an asset is worth in dollars, or null.
 *
 * Null when no dollar market exists for it. Not zero, and not a price derived
 * by chaining through bitcoin: a two-hop conversion compounds two spreads and
 * produces a number nobody can check against anything the exchange displays.
 */
export function priceInDollars(
  prices: ReadonlyMap<string, number>,
  asset: string
): number | null {
  const code = asset.toUpperCase();
  if ((DOLLAR_QUOTES as readonly string[]).includes(code)) return 1;

  for (const quote of DOLLAR_QUOTES) {
    const price = prices.get(`${code}${quote}`);
    if (price !== undefined) return price;
  }
  return null;
}

/**
 * Signs a request.
 *
 * HMAC-SHA256 over the query string exactly as it will be sent, keyed with the
 * secret as plain text, hex encoded. The signature covers the string that goes
 * on the wire, so building the query twice — once to sign, once to send — is
 * how this breaks; `buildQuery` exists so there is only ever one.
 *
 * Pinned against Binance's own published example in the tests.
 */
export function signQuery(queryString: string, apiSecret: string): string {
  return createHmac("sha256", apiSecret).update(queryString).digest("hex");
}

/**
 * The query string, in insertion order, which is the order it gets signed in.
 *
 * `URLSearchParams` is deliberately not used for the signed portion: it
 * percent-encodes to its own taste, and a signature over one encoding sent with
 * another is rejected as an invalid signature — indistinguishable from a wrong
 * key, and diagnosed as one.
 */
export function buildQuery(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");
}

/**
 * True for something shaped like a Binance API key.
 *
 * Loose on purpose — it catches an empty box and a wallet address pasted by
 * mistake, and leaves the verdict to the venue. A strict pattern would start
 * rejecting valid keys the day the format changes, and would look like a bug
 * in the app rather than a rule in this function.
 */
export function isValidApiKey(value: string): boolean {
  const key = value.trim();
  return key.length >= 40 && !key.startsWith("0x") && !/\s/.test(key);
}
