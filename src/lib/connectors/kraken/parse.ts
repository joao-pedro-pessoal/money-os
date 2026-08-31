/**
 * Pure parsing and signing for Kraken's REST API.
 *
 * Shapes: https://docs.kraken.com/api/docs/rest-api/get-account-balance
 *
 * Three things about this API decide the whole design of this file.
 *
 * **An error arrives with HTTP 200.** Kraken answers `{"error":["EAPI:Invalid
 * key"],"result":{}}` with a perfectly good status line. A caller checking
 * `res.ok` sees success and an empty balance sheet — a wrong key would present
 * as an account that holds nothing, which is a number, and a very alarming one.
 * `krakenError` exists so that can never be read as data.
 *
 * **Asset codes are not ticker symbols.** Bitcoin is `XXBT`, euros are `ZEUR`,
 * and the X/Z prefixes are a legacy of Kraken's original four-character
 * scheme. Newer assets have no prefix at all, so the rule cannot be "strip the
 * first letter" — `SOL` would become `OL`. Suffixes carry meaning too: `.S` is
 * staked, `.F` is Kraken's flexible earn product, and both are the same asset
 * in a different state rather than different assets.
 *
 * **A pair is named by the venue, not by you.** Kraken accepts aliases and
 * answers under its own canonical name, so the key you asked for is not
 * necessarily the key you get back. Nothing here pairs a request to a response
 * by position or by assumed name — the same rule the Hyperliquid connector
 * learned expensively (see CLAUDE.md).
 *
 * Pure — no fetch, no DB. Signing is arithmetic on strings.
 */

import { createHash, createHmac } from "crypto";

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
 * The error Kraken reported, or null.
 *
 * Returns the joined text rather than a boolean so the caller can put the
 * venue's own words on screen. "Could not sync" names nothing and costs a round
 * trip; `EAPI:Invalid key` says exactly what to go and fix.
 */
export function krakenError(payload: unknown): string | null {
  const root = asRecord(payload);
  if (root === null) return "Kraken returned something that was not an object.";

  const errors = root.error;
  if (!Array.isArray(errors) || errors.length === 0) return null;

  const text = errors.filter((e): e is string => typeof e === "string");
  return text.length > 0 ? text.join("; ") : "Kraken reported an unreadable error.";
}

/** The `result` block, or null when the reply carries an error or no result. */
export function krakenResult(payload: unknown): Record<string, unknown> | null {
  if (krakenError(payload) !== null) return null;
  const root = asRecord(payload);
  return root === null ? null : asRecord(root.result);
}

export interface KrakenAsset {
  /** The code as Kraken wrote it, kept so a lookup can use it verbatim. */
  raw: string;
  /** The ordinary ticker: XXBT becomes BTC, ZEUR becomes EUR, SOL stays SOL. */
  symbol: string;
  /** Held in a staking or earn product rather than free on the exchange. */
  earning: boolean;
}

/**
 * Kraken's legacy four-character codes, and only those.
 *
 * `X` prefixed a crypto asset and `Z` a national currency, in a scheme Kraken
 * stopped applying to anything listed after about 2018. Listing them is
 * deliberate: a rule like "drop a leading X from a four-character code" would
 * also maul `XTZ` (Tezos), which is a real asset code and not a prefixed one.
 * An unknown code is passed through unchanged, which is the safe direction —
 * a symbol that fails to match a price is visible, a wrongly renamed one is not.
 */
const LEGACY_CODES: Record<string, string> = {
  XXBT: "BTC",
  XBT: "BTC",
  XETH: "ETH",
  XLTC: "LTC",
  XXRP: "XRP",
  XXLM: "XLM",
  XXMR: "XMR",
  XZEC: "ZEC",
  XREP: "REP",
  XETC: "ETC",
  XMLN: "MLN",
  XXDG: "DOGE",
  ZEUR: "EUR",
  ZUSD: "USD",
  ZGBP: "GBP",
  ZCAD: "CAD",
  ZAUD: "AUD",
  ZJPY: "JPY",
  ZCHF: "CHF",
};

/**
 * Suffixes that describe a *state* of an asset, not a different asset.
 *
 * `DOT.S` is staked DOT and `USDT.F` is USDT in the flexible earn product.
 * Both are still the thing they are, and treating them as separate assets
 * would split one holding into two rows that each look small.
 */
const STATE_SUFFIXES = [".S", ".F", ".B", ".M", ".P"];

export function normaliseAsset(code: string): KrakenAsset {
  const raw = code.trim();
  let body = raw.toUpperCase();
  let earning = false;

  for (const suffix of STATE_SUFFIXES) {
    if (body.endsWith(suffix)) {
      body = body.slice(0, -suffix.length);
      earning = true;
      break;
    }
  }

  // `ETH2` is the old staked-ether code and is ether.
  if (body === "ETH2") {
    return { raw, symbol: "ETH", earning: true };
  }

  return { raw, symbol: LEGACY_CODES[body] ?? body, earning };
}

export interface KrakenBalance {
  asset: KrakenAsset;
  /** Everything held, including anything reserved against an open order. */
  total: number;
  /** Units the venue says are not free to move. */
  hold: number;
}

/**
 * Balances, from either shape this API returns.
 *
 * `Balance` answers `{"XXBT":"0.5"}` and `BalanceEx` answers
 * `{"XXBT":{"balance":"0.5","hold_trade":"0.1"}}`. Accepting both means the
 * caller can move between the two endpoints without this file caring, and a
 * response that is half one and half the other still parses.
 *
 * A zero balance is dropped. Kraken keeps a row for every asset you have ever
 * touched, so an account of four holdings can return sixty lines of nothing —
 * and those are genuinely zero rather than unmeasured, which is why dropping
 * them is honest here and would not be for a price.
 */
export function parseBalances(payload: unknown): KrakenBalance[] {
  const result = krakenResult(payload);
  if (result === null) return [];

  const balances: KrakenBalance[] = [];

  for (const [code, value] of Object.entries(result)) {
    let total: number | null;
    let hold = 0;

    const detailed = asRecord(value);
    if (detailed !== null) {
      total = num(detailed.balance);
      hold = num(detailed.hold_trade) ?? 0;
    } else {
      total = num(value);
    }

    if (total === null || total === 0) continue;
    balances.push({ asset: normaliseAsset(code), total, hold });
  }

  return balances.sort((a, b) => a.asset.symbol.localeCompare(b.asset.symbol));
}

export interface KrakenTradeBalance {
  /** Everything the account holds, in the currency it was asked for. */
  equity: number | null;
  /** Free margin: what could still be committed. */
  free: number | null;
  /** Margin currently committed to open positions. */
  marginUsed: number | null;
}

/**
 * `TradeBalance`, which values the whole account in one currency.
 *
 * The field names are two letters each: `e` is equity, `mf` free margin, `m`
 * the margin amount. Every one of them is read explicitly rather than by
 * position or by iteration, because a two-letter key is exactly the kind of
 * thing that looks like a typo when it is right.
 *
 * Every field is nullable. An account that has never traded on margin has no
 * margin figures at all, and reporting those as zero would say the account has
 * nothing committed — which is true, but says it as a measurement when it is
 * an absence. The interface above lets the caller tell them apart.
 */
export function parseTradeBalance(payload: unknown): KrakenTradeBalance | null {
  const result = krakenResult(payload);
  if (result === null) return null;

  return {
    equity: num(result.e),
    free: num(result.mf),
    marginUsed: num(result.m),
  };
}

export interface KrakenPair {
  /** Kraken's canonical name for the pair, which is what Ticker keys on. */
  name: string;
  base: string;
  quote: string;
}

/**
 * The tradeable pairs, indexed by the venue's own name for each.
 *
 * `AssetPairs` exists so nothing here has to *construct* a pair name. Guessing
 * that BTC against USD is "XXBTZUSD" is right today and has been wrong before;
 * asking which pairs exist and reading the base and quote off each one cannot
 * drift.
 */
export function parseAssetPairs(payload: unknown): KrakenPair[] {
  const result = krakenResult(payload);
  if (result === null) return [];

  const pairs: KrakenPair[] = [];
  for (const [name, value] of Object.entries(result)) {
    const detail = asRecord(value);
    if (detail === null) continue;
    if (typeof detail.base !== "string" || typeof detail.quote !== "string") continue;

    pairs.push({
      name,
      base: normaliseAsset(detail.base).symbol,
      quote: normaliseAsset(detail.quote).symbol,
    });
  }
  return pairs;
}

/**
 * The pair that prices one asset in one currency, or null.
 *
 * Null rather than a guess. An asset Kraken lists no pair for is one this app
 * cannot price, and the screen says unpriced — which is the honest outcome and
 * the whole argument of `CLAUDE.md`'s section on absence.
 */
export function pairFor(pairs: readonly KrakenPair[], base: string, quote: string): string | null {
  const match = pairs.find((p) => p.base === base && p.quote === quote);
  return match?.name ?? null;
}

/**
 * Last-traded price per pair, keyed by the name Kraken answered with.
 *
 * `c` is the last-trade array and `c[0]` its price. The keys come from the
 * response and are never assumed to match what was requested: Kraken accepts
 * aliases and normalises them, so asking for `XBTUSD` can be answered under
 * `XXBTZUSD`. Reading the response's own keys is the only join that holds —
 * the same rule that the Hyperliquid contexts taught, in a different costume.
 */
export function parseTickerPrices(payload: unknown): Map<string, number> {
  const result = krakenResult(payload);
  const prices = new Map<string, number>();
  if (result === null) return prices;

  for (const [name, value] of Object.entries(result)) {
    const detail = asRecord(value);
    if (detail === null) continue;

    const last = Array.isArray(detail.c) ? num(detail.c[0]) : null;
    // A price of zero is not a price. A dormant pair reporting one is how a
    // token worth 76 was once valued at nothing.
    if (last === null || last <= 0) continue;

    prices.set(name, last);
  }
  return prices;
}

/**
 * True for something shaped like a Kraken API key.
 *
 * Deliberately loose: it rejects an empty box and an obviously pasted wallet
 * address, and leaves the real verdict to the venue. A strict pattern here
 * would reject a valid key the day Kraken changes its format, and the failure
 * would look like a bug in the app rather than a rule in this function.
 */
export function isValidApiKey(value: string): boolean {
  const key = value.trim();
  return key.length >= 40 && !key.startsWith("0x") && !/\s/.test(key);
}

/**
 * Signs a private request.
 *
 * The scheme is HMAC-SHA512 over `path + SHA256(nonce + body)`, keyed with the
 * base64-*decoded* secret, and base64 encoded. Two details cause almost every
 * failed signature: the secret is decoded rather than used as text, and the
 * nonce inside the SHA256 is the same nonce that appears in the body, as a
 * string, concatenated with no separator. Both are pinned by tests.
 */
export function signRequest(
  path: string,
  nonce: string,
  body: string,
  apiSecret: string
): string {
  const hashed = createHash("sha256").update(nonce + body).digest();
  return createHmac("sha512", Buffer.from(apiSecret, "base64"))
    .update(Buffer.concat([Buffer.from(path, "utf8"), hashed]))
    .digest("base64");
}

/** A nonce Kraken will accept: milliseconds, which only ever increases. */
export function makeNonce(now: number = Date.now()): string {
  return String(now);
}
