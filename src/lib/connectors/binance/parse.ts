/**
 * Binance's own additions to a spot v3 API: its error shape and its key format.
 *
 * The shared shapes — balances, ticker prices, dollar pricing, signing — moved
 * to `../spotV3`, because MEXC copied Binance's v3 API endpoint for endpoint
 * and a second copy of seven functions is seven chances to drift. They are
 * re-exported here so this module stays the one place a Binance connector
 * reads from, and so the tests that pin them keep pinning them.
 *
 * What stayed is what is genuinely Binance's:
 *
 * **The error shape.** `{"code":-2015,"msg":"..."}` — and the sign of that
 * code is the whole test. Binance errors are negative; MEXC's are positive, so
 * this function reports "no error" for every MEXC failure, which is why
 * `mexcError` exists rather than a shared one. A venue's error shape is the
 * last thing to assume is portable.
 *
 * Pure — no fetch, no DB.
 */

export {
  num,
  asRecord,
  parseAccountBalances,
  parseTickerPrices,
  DOLLAR_QUOTES,
  priceInDollars,
  signQuery,
  buildQuery,
} from "../spotV3";
export type { SpotBalance, SpotBalance as BinanceBalance } from "../spotV3";

import { asRecord } from "../spotV3";

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
