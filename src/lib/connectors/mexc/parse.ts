/**
 * MEXC's own additions to a spot v3 API: its error shape and its key format.
 *
 * MEXC copied Binance's v3 spot API endpoint for endpoint — `/api/v3/account`
 * returns `{balances:[{asset,free,locked}]}`, `/api/v3/ticker/price` returns
 * `[{symbol,price}]`, and requests are signed with HMAC-SHA256 over the query
 * string. All of that is shared from `../spotV3` rather than copied.
 *
 * Two things are not shared, and both are places where assuming Binance's
 * behaviour gives the wrong answer silently.
 *
 * Docs: https://mexcdevelop.github.io/apidocs/spot_v3_en/
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
export type { SpotBalance } from "../spotV3";

import { asRecord } from "../spotV3";

/**
 * Codes that accompany a successful reply rather than a failure.
 *
 * Most MEXC endpoints omit `code` entirely on success; a few answer `200`, and
 * `0` is the conventional success sentinel across the exchange's other APIs.
 * Both are listed so neither is ever read as a failure.
 */
const SUCCESS_CODES = new Set([0, 200]);

/**
 * The error MEXC reported, or null.
 *
 * **MEXC's error codes are positive.** This is the trap, and it is the same
 * shape of trap as OKX's string `"0"` and Kraken's HTTP 200: the neighbouring
 * connector's test gives the wrong answer, in the direction that hurts.
 *
 * Binance signals failure with a negative code, so `binanceError` asks
 * `code < 0`. MEXC answers a positive one. Confirmed against the live API with
 * a deliberately invalid key: HTTP 400 and `{"code":10072,"msg":"Api key info
 * invalid"}`, on which `mexcError` reports the refusal and `binanceError`
 * returns `null`.
 *
 * That `null` is the whole danger. Read as "no error", the payload goes on to
 * be parsed for balances; `{balances:[...]}` is absent, so nothing is found,
 * and the account reads as **holding nothing**. A wrong key would look like an
 * emptied exchange, and net worth would drop without a word.
 *
 * So the test is not the sign of the code but its presence: a numeric `code`
 * carrying a string `msg` is a failure unless the code is a documented success
 * sentinel. That errs toward reporting an error, which is the safe direction —
 * a sync that stops loudly leaves the last good balance untouched, and a sync
 * that succeeds emptily overwrites it.
 *
 * The message is kept verbatim. These codes distinguish a bad key from a bad
 * signature from an IP that is not on the allowlist, and only the venue's own
 * words say which without guessing.
 */
export function mexcError(payload: unknown): string | null {
  const root = asRecord(payload);
  if (root === null) return null;

  const code = root.code;
  const message = root.msg;
  if (typeof code !== "number" || typeof message !== "string") return null;
  if (SUCCESS_CODES.has(code)) return null;

  return `${message} (code ${code})`;
}

/**
 * True for something shaped like a MEXC API key.
 *
 * MEXC keys start with `mx0` and run to about thirty characters — shorter than
 * Binance's 64, which is why this cannot borrow Binance's `isValidApiKey`: that
 * one demands 40 characters and would reject every valid MEXC key, at the form,
 * before the venue ever sees it.
 *
 * Loose on purpose beyond that. It catches an empty box and a wallet address
 * pasted by mistake, and leaves the verdict to MEXC. A strict pattern would
 * start rejecting valid keys the day the format changes, and would look like a
 * bug in the app rather than a rule in this function.
 */
export function isValidApiKey(value: string): boolean {
  const key = value.trim();
  return key.length >= 16 && !key.startsWith("0x") && !/\s/.test(key);
}
