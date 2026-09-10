/**
 * The parts of a Binance-style spot REST API that are the same everywhere.
 *
 * Binance's v3 spot API has been copied, endpoint for endpoint, by several
 * exchanges — MEXC among them. `/api/v3/account` returns
 * `{balances:[{asset,free,locked}]}`, `/api/v3/ticker/price` returns
 * `[{symbol,price}]`, and requests are signed with HMAC-SHA256 over the query
 * string. Those shapes live here so there is one definition of each rather
 * than one per venue: seven functions copied into a second connector folder
 * would be seven chances for the copies to drift, and this codebase's most
 * repeated bug is a second definition of something that already existed.
 *
 * **What does not live here is the error shape.** Every one of these venues
 * invented its own, and each one is a trap in its own direction — see
 * `binanceError` and `mexcError`, which sit with their connectors for exactly
 * that reason.
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

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export interface SpotBalance {
  asset: string;
  /** Everything held: free plus whatever is locked in resting orders. */
  total: number;
  /** Units locked in resting orders. */
  hold: number;
}

/**
 * Spot balances from `/api/v3/account`.
 *
 * These venues return a row for every asset ever listed against the account,
 * the overwhelming majority at zero. Those are dropped: the venue measured and
 * found nothing, which is a measurement, and keeping them would bury four real
 * holdings in three hundred empty ones.
 */
export function parseAccountBalances(payload: unknown): SpotBalance[] {
  const root = asRecord(payload);
  const rows = root === null ? null : root.balances;
  if (!Array.isArray(rows)) return [];

  const balances: SpotBalance[] = [];
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
 * One call for every symbol on the exchange — about 150 KB and 3 700 rows on
 * Binance, against 16 MB for `exchangeInfo`, which is why the price map is
 * built from this and pairs are composed rather than looked up.
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
 *
 * **Composes a symbol; never decomposes one.** On Binance
 * `symbol === baseAsset + quoteAsset` holds for all 3 645 spot symbols,
 * checked against the live `exchangeInfo`, so building `BTC` + `USDT` is exact.
 * Splitting is not: eight real symbols decompose two ways against Binance's own
 * quote list — `BTCBUSD` is (BTC, BUSD) and also reads as (BTCB, USD).
 *
 * Checked on MEXC too, against its live `exchangeInfo`: 0 exceptions across
 * all 2 071 spot symbols. Each venue is worth confirming, but the direction is
 * what makes this safe even unconfirmed — a composed symbol the venue does not
 * list simply misses the map and yields null, so the holding is reported as
 * unpriced and excluded from totals. Composition can fail to find a price; it
 * cannot invent a wrong one.
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
