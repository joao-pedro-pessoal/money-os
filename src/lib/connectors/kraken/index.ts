/**
 * KrakenConnector — read-only.
 *
 * Four endpoints, and not one of them can move anything: `BalanceEx` and
 * `TradeBalance` read the account, `AssetPairs` and `Ticker` are public price
 * data. `/0/private/AddOrder` is never imported, so placing an order is not
 * something this code could do by mistake.
 *
 * Kraken issues keys with per-permission scopes, and this only needs "Query
 * Funds". A key without trade permission cannot trade even if this file were
 * wrong, which is the belt to the architecture's braces.
 *
 * The secret arrives already decrypted from src/lib/crypto and is never logged.
 */

import type { Connector, NormalizedAccountState, NormalizedBalance } from "../types";
import {
  krakenError,
  parseBalances,
  parseTradeBalance,
  parseAssetPairs,
  parseTickerPrices,
  pairFor,
  isValidApiKey,
  signRequest,
  makeNonce,
} from "./parse";

export const KRAKEN_BASE_URL = "https://api.kraken.com";

/**
 * What the account is valued in.
 *
 * Kraken will value an account in any of its quote currencies, and this asks
 * for US dollars because that is what `NormalizedAccountState.balances`
 * documents `usdValue` to be. The `currency` field on the reply says so
 * explicitly rather than leaving the caller to assume — Trading 212 reporting
 * euros while the app assumed dollars was a 15% error that looked like a bug
 * in the totals.
 */
const VALUATION_ASSET = "ZUSD";
const VALUATION_SYMBOL = "USD";

export interface KrakenCredentials {
  apiKey: string;
  apiSecret: string;
}

/** Signed POST for the private endpoints; swapped out in tests. */
export type KrakenPrivatePost = (
  url: string,
  body: string,
  headers: Record<string, string>
) => Promise<unknown>;

/** Plain GET for the public price endpoints. */
export type KrakenPublicGet = (url: string) => Promise<unknown>;

export function createKrakenConnector(
  credentials: KrakenCredentials,
  privatePost: KrakenPrivatePost = defaultPrivatePost,
  publicGet: KrakenPublicGet = defaultPublicGet,
  baseUrl: string = KRAKEN_BASE_URL
): Connector {
  /**
   * Calls a private endpoint and refuses to read an error as data.
   *
   * Kraken answers a bad key with HTTP 200 and `{"error":["EAPI:Invalid
   * key"],"result":{}}`. A caller that only checks the status sees an account
   * holding nothing — a wrong credential rendering as a wiped-out portfolio.
   * The venue's own words are put in the thrown message, because "sync failed"
   * names nothing and costs a round trip to diagnose.
   */
  async function callPrivate(method: string, params: Record<string, string> = {}) {
    const path = `/0/private/${method}`;
    const nonce = makeNonce();
    const body = new URLSearchParams({ nonce, ...params }).toString();

    const payload = await privatePost(`${baseUrl}${path}`, body, {
      "API-Key": credentials.apiKey,
      "API-Sign": signRequest(path, nonce, body, credentials.apiSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    });

    const error = krakenError(payload);
    if (error !== null) throw new Error(`Kraken refused ${method}: ${error}`);
    return payload;
  }

  async function callPublic(path: string) {
    const payload = await publicGet(`${baseUrl}${path}`);
    const error = krakenError(payload);
    if (error !== null) throw new Error(`Kraken refused ${path}: ${error}`);
    return payload;
  }

  return {
    platform: "kraken",

    validateIdentifier(identifier: string) {
      if (!isValidApiKey(identifier)) {
        return { ok: false as const, reason: "That doesn't look like a Kraken API key" };
      }
      return { ok: true as const };
    },

    async getAccountState(): Promise<NormalizedAccountState> {
      const [balanceReply, tradeReply] = await Promise.all([
        callPrivate("BalanceEx"),
        callPrivate("TradeBalance", { asset: VALUATION_ASSET }),
      ]);

      const held = parseBalances(balanceReply);
      const trade = parseTradeBalance(tradeReply);

      /**
       * Prices, asked for by the venue's own pair names.
       *
       * The pair list is fetched rather than constructed: "BTC against USD is
       * XXBTZUSD" is a guess that happens to be right, and this app has paid
       * for that kind of guess before. An asset with no listed pair stays
       * unpriced, and the screen says unpriced.
       */
      const needsPrice = held.filter((b) => b.asset.symbol !== VALUATION_SYMBOL);
      const priceBySymbol = new Map<string, number>();

      if (needsPrice.length > 0) {
        const pairs = parseAssetPairs(await callPublic("/0/public/AssetPairs"));

        const wanted: { symbol: string; pair: string }[] = [];
        for (const balance of needsPrice) {
          const pair = pairFor(pairs, balance.asset.symbol, VALUATION_SYMBOL);
          if (pair !== null) wanted.push({ symbol: balance.asset.symbol, pair });
        }

        if (wanted.length > 0) {
          const prices = parseTickerPrices(
            await callPublic(
              `/0/public/Ticker?pair=${encodeURIComponent(wanted.map((w) => w.pair).join(","))}`
            )
          );
          for (const { symbol, pair } of wanted) {
            const price = prices.get(pair);
            if (price !== undefined) priceBySymbol.set(symbol, price);
          }
        }
      }

      const balances: NormalizedBalance[] = held.map((b) => {
        // The valuation currency prices itself. Everything else is looked up,
        // and an absence stays an absence: `?? 0` here would delete the row
        // from every total that reads it.
        const price =
          b.asset.symbol === VALUATION_SYMBOL ? 1 : priceBySymbol.get(b.asset.symbol) ?? null;

        return {
          coin: b.asset.symbol,
          total: b.total,
          hold: b.hold,
          price,
          usdValue: price === null ? null : round2(b.total * price),
          /**
           * Kraken does not publish what a spot holding cost, so this is null
           * and must stay null. Zero would claim the holding is exactly
           * break-even, which is the `+0,00 €` bug this codebase keeps
           * removing — and the dashboard now reports it as cost unknown.
           */
          costBasis: null,
        };
      });

      const spotValue = round2(
        balances.reduce((sum, b) => sum + (b.usdValue ?? 0), 0)
      );

      return {
        currency: VALUATION_SYMBOL,
        /**
         * The venue's own valuation of the account where it gives one, and the
         * sum of what could be priced otherwise. Two readings of one quantity,
         * and preferring Kraken's own is right: it can price assets this app
         * found no pair for.
         */
        equity: trade?.equity ?? spotValue,
        withdrawable: trade?.free ?? null,
        totalMarginUsed: trade?.marginUsed ?? null,
        /**
         * Spot only. Kraken's margin and futures positions are a separate
         * product with their own endpoints, and reporting an empty list would
         * assert there are none — which this connector has not asked and does
         * not know. Null says so.
         */
        totalNotionalPosition: null,
        asOf: new Date(),
        positions: [],
        balances,
        spotValue,
        /**
         * The balances *are* the account. `equity` above is Kraken's valuation
         * of these same coins, so adding the two would count every holding
         * twice — the recurring bug this flag exists to prevent.
         */
        balancesAreSeparatePool: false,
      };
    },
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const defaultPrivatePost: KrakenPrivatePost = async (url, body, headers) => {
  const res = await fetch(url, { method: "POST", headers, body });
  // A non-200 is worth reporting on its own; a 200 carrying an error array is
  // handled by the caller, which is the case that actually happens.
  if (!res.ok) throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  return res.json();
};

const defaultPublicGet: KrakenPublicGet = async (url) => {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  return res.json();
};
