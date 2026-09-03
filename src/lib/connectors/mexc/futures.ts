/**
 * MEXC futures — a different host, a different signing scheme, a different
 * envelope, and contracts instead of coins.
 *
 * Nothing here is shared with the spot connector, because nothing about it is
 * the same. Spot lives on `api.mexc.com`, signs a query string and answers a
 * bare object; futures live on `contract.mexc.com`, sign
 * `accessKey + timestamp + params` into headers, and answer
 * `{success, code, data}`.
 *
 * Shapes and rules taken from MEXC's published contract API documentation:
 * https://mexcdevelop.github.io/apidocs/contract_v1_en/
 *
 * Four facts from those docs drive everything below, and getting any of them
 * wrong produces a plausible number rather than an error:
 *
 *  1. **`equity` already contains `unrealized`.** Adding them counts the same
 *     floating profit twice — the failure this codebase removes most often.
 *  2. **Volumes are in contracts, not coins.** BTC_USDT has a contractSize of
 *     0.0001, so reading `holdVol` as a coin amount overstates a position by
 *     ten thousand times.
 *  3. **`assets` is one row per settlement currency.** Summing them raw adds
 *     amounts in different currencies, which this codebase forbids outright.
 *  4. **Success is `code: 0`.** Non-zero is a failure, and the message may
 *     arrive under `msg` or `message`.
 *
 * Pure — no fetch, no DB.
 */

import { createHmac } from "crypto";
import { num, asRecord } from "../spotV3";
import type { NormalizedPosition, InvestmentActivityRow } from "../types";

/**
 * The error the contract API reported, or null.
 *
 * Deliberately not `mexcError` from the spot connector. That one reads `msg`
 * and treats a missing code as success, which is right for an endpoint whose
 * successful replies carry no code at all. Here *every* reply carries one, and
 * success is exactly `0` — so the test is the envelope's own contract rather
 * than an inference from which fields happen to be present.
 */
export function contractError(payload: unknown): string | null {
  const root = asRecord(payload);
  if (root === null) return null;

  const code = root.code;
  if (typeof code !== "number") return null;
  if (code === 0) return null;

  const message =
    typeof root.msg === "string"
      ? root.msg
      : typeof root.message === "string"
        ? root.message
        : "no message";

  return `${message} (code ${code})`;
}

/**
 * The signing target: `accessKey + timestamp + parameterString`.
 *
 * HMAC-SHA256, hex, passed on without base64 — MEXC's docs are explicit that
 * the digest goes in the `Signature` header as-is.
 */
export function futuresSignature(
  accessKey: string,
  apiSecret: string,
  timestamp: string,
  parameterString: string
): string {
  return createHmac("sha256", apiSecret)
    .update(accessKey + timestamp + parameterString)
    .digest("hex");
}

/**
 * Query parameters in dictionary order, which is the order MEXC signs.
 *
 * The docs require GET parameters "sorted in dictionary order, concatenated
 * with &". Insertion order would work by luck for `page_num`/`page_size` and
 * break the moment a third parameter is added between them — an invalid
 * signature that reads exactly like a wrong key.
 */
export function sortedQuery(params: Record<string, string | number>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

export interface FuturesAsset {
  currency: string;
  /** The account's value in this currency. Already includes `unrealized`. */
  equity: number;
  available: number;
  positionMargin: number;
  unrealized: number;
}

/**
 * Per-currency futures balances from `/api/v1/private/account/assets`.
 *
 * Rows with nothing in them are dropped — MEXC lists every settlement currency
 * it supports, and an account trading USDT perpetuals carries a dozen zeroes
 * behind the one row that matters.
 *
 * `equity` is taken as the venue states it. It is not recomputed from
 * `cashBalance + unrealized`: a second definition of the same figure would
 * disagree the moment MEXC counts a bonus or a fee differently from the way
 * this file assumed.
 */
export function parseFuturesAssets(payload: unknown): FuturesAsset[] {
  const root = asRecord(payload);
  const rows = root === null ? null : root.data;
  if (!Array.isArray(rows)) return [];

  const assets: FuturesAsset[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (record === null || typeof record.currency !== "string") continue;

    const equity = num(record.equity);
    const available = num(record.availableBalance);
    const margin = num(record.positionMargin);
    const unrealized = num(record.unrealized);

    // Nothing measured at all is not a balance of zero; it is a row that says
    // nothing, and it should not be presented as an empty wallet.
    if (equity === null && available === null && margin === null) continue;

    const value = equity ?? 0;
    const held = value !== 0 || (available ?? 0) !== 0 || (margin ?? 0) !== 0;
    if (!held) continue;

    assets.push({
      currency: record.currency.toUpperCase(),
      equity: value,
      available: available ?? 0,
      positionMargin: margin ?? 0,
      unrealized: unrealized ?? 0,
    });
  }

  return assets.sort((a, b) => b.equity - a.equity);
}

/**
 * How many coins one contract is, per symbol, from the public
 * `/api/v1/contract/detail`.
 *
 * Without this every position size is wrong by orders of magnitude, and wrong
 * in a way that looks like a real number.
 */
export function parseContractSizes(payload: unknown): Map<string, number> {
  const sizes = new Map<string, number>();
  const root = asRecord(payload);
  const rows = root === null ? null : root.data;
  if (!Array.isArray(rows)) return sizes;

  for (const row of rows) {
    const record = asRecord(row);
    if (record === null || typeof record.symbol !== "string") continue;

    const size = num(record.contractSize);
    // A contract worth zero coins is not a contract. Excluded rather than
    // defaulted to 1, which would silently misreport every position in it.
    if (size === null || size <= 0) continue;

    sizes.set(record.symbol.toUpperCase(), size);
  }
  return sizes;
}

/**
 * The coin a contract is on.
 *
 * MEXC names its contracts `BTC_USDT` — with a separator the venue itself put
 * there. This is not the Binance rule in reverse: splitting on an explicit
 * delimiter is reading what the venue stated, whereas decomposing `BTCBUSD`
 * would be guessing where a boundary falls.
 */
export function coinOf(symbol: string): string {
  const [base] = symbol.toUpperCase().split("_");
  return base ?? symbol.toUpperCase();
}

/** 1 = long, 2 = short. Anything else is not a direction this understands. */
function sideOf(positionType: unknown): "long" | "short" | null {
  if (positionType === 1) return "long";
  if (positionType === 2) return "short";
  return null;
}

export interface OpenPositions {
  positions: NormalizedPosition[];
  /**
   * Symbols whose contract size is unknown, so no coin amount could be stated.
   *
   * Reported rather than guessed at. Dropping the row costs nothing in the
   * totals — `equity` already contains its profit and `positionMargin` its
   * collateral — so the only loss is a display line, against a size that would
   * have been wrong by four orders of magnitude.
   */
  unconvertible: string[];
}

/** Open futures positions from `/api/v1/private/position/open_positions`. */
export function parseOpenPositions(
  payload: unknown,
  contractSizes: ReadonlyMap<string, number>
): OpenPositions {
  const root = asRecord(payload);
  const rows = root === null ? null : root.data;
  if (!Array.isArray(rows)) return { positions: [], unconvertible: [] };

  const positions: NormalizedPosition[] = [];
  const unconvertible: string[] = [];

  for (const row of rows) {
    const record = asRecord(row);
    if (record === null || typeof record.symbol !== "string") continue;

    const side = sideOf(record.positionType);
    const volume = num(record.holdVol);
    if (side === null || volume === null || volume === 0) continue;

    const symbol = record.symbol.toUpperCase();
    const size = contractSizes.get(symbol);
    if (size === undefined) {
      unconvertible.push(symbol);
      continue;
    }

    positions.push({
      coin: coinOf(symbol),
      side,
      // Always positive; direction lives in `side`.
      size: Math.abs(volume * size),
      entryPrice: num(record.holdAvgPrice),
      markPrice: null,
      positionValue: null,
      /**
       * MEXC calls the open position's floating result `realised` on this
       * endpoint, which is its own word for it and not this app's — the figure
       * is what an open position has made so far, which is unrealised by every
       * definition this codebase uses. Named for what it is.
       */
      unrealizedPnl: num(record.realised),
      returnOnEquity: null,
      leverage: num(record.leverage),
      // 1 = isolated, 2 = cross.
      leverageType: record.openType === 1 ? "isolated" : record.openType === 2 ? "cross" : null,
      liquidationPrice: num(record.liquidatePrice),
      marginUsed: num(record.im) ?? num(record.oim),
      cumFunding: null,
      assetClass: "PERP",
    });
  }

  return { positions, unconvertible };
}

/**
 * Closed positions from `/api/v1/private/position/list/history_positions`,
 * as trade history.
 *
 * One row per position opened and closed, which is exactly what this app's
 * trade history is for. MEXC **states** the realised result, so it travels on
 * the row and nothing is derived — `lib/trading/realised.ts` only computes one
 * where the venue is silent, and mixing a stated figure with a derived one
 * inside a single instrument gives a number belonging to neither method.
 *
 * A row whose close time cannot be read is skipped rather than dated to now.
 * A trade filed under the wrong day corrupts every window a filter can select,
 * and an absent trade at least announces itself as missing.
 */
export function parseHistoryPositions(
  payload: unknown,
  contractSizes: ReadonlyMap<string, number>
): InvestmentActivityRow[] {
  const root = asRecord(payload);
  const rows = root === null ? null : root.data;
  if (!Array.isArray(rows)) return [];

  const activity: InvestmentActivityRow[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (record === null || typeof record.symbol !== "string") continue;

    const side = sideOf(record.positionType);
    const closed = num(record.closeVol);
    if (side === null || closed === null || closed === 0) continue;

    const closedAt = num(record.updateTime) ?? num(record.createTime);
    if (closedAt === null) continue;

    const positionId = record.positionId;
    if (positionId === undefined || positionId === null) continue;

    const symbol = record.symbol.toUpperCase();
    const size = contractSizes.get(symbol);
    const realised = num(record.realised);

    /**
     * Closing a long is a sale; closing a short is a purchase. That is what
     * happened at the venue, and it keeps the quantity signs meaningful for
     * anything matching closes against opens.
     */
    const type = side === "long" ? "SELL" : "BUY";

    activity.push({
      date: new Date(closedAt).toISOString(),
      type,
      symbol: coinOf(symbol),
      // Null rather than a contract count, which is not a quantity of anything.
      quantity: size === undefined ? null : Math.abs(closed * size),
      price: num(record.closeAvgPrice) ?? num(record.holdAvgPrice),
      /**
       * The cash effect of closing, which is the realised result. The margin
       * coming back is money that never left the account, so counting it as a
       * movement would invent a deposit.
       */
      amount: realised ?? 0,
      fees: null,
      // USDT-settled contracts, which is what `_USDT` names.
      currency: settleOf(symbol),
      description: `MEXC futures ${side} closed`,
      // The venue's own id, which is what makes a re-sync idempotent.
      externalId: `mexc-futures-${String(positionId)}`,
      realizedPnl: realised,
    });
  }

  return activity.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * What one unit of a settlement currency is worth in dollars, or null.
 *
 * MEXC settles its contracts in four things, not one — `USDT`, `USDC`, `USD`
 * and `USD1`, counted across the 1 170 contracts it lists. Summing an account's
 * rows without converting would be adding different currencies, which this
 * codebase forbids outright.
 *
 * `USD` is handled here rather than by `priceInDollars`, because it is not an
 * asset with a market: it is the unit the answer is expressed in, and asking a
 * crypto ticker for its price would find no `USDUSDT` pair and report a real
 * balance as unpriceable. The same distinction `isCurrencyCode` draws in
 * `src/lib/fx` — a currency is not a holding.
 *
 * `USD1` is a stablecoin and goes the other way: worth about a dollar because
 * a peg holds, which is a fact about a holding and belongs to the price lookup.
 */
export function settlementRate(
  currency: string,
  priceLookup: (asset: string) => number | null
): number | null {
  return currency.toUpperCase() === "USD" ? 1 : priceLookup(currency);
}

/**
 * What a contract settles in, from the name the venue gave it.
 *
 * `BTC_USDT` settles USDT. Falls back to USDT rather than to the empty string:
 * every contract MEXC lists is USDT-settled, and a row with no currency is
 * excluded from every total by `sumInBase` — which would silently drop a real
 * trade instead of showing it.
 */
export function settleOf(symbol: string): string {
  const parts = symbol.toUpperCase().split("_");
  return parts.length > 1 ? parts[parts.length - 1] : "USDT";
}
