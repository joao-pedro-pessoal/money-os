/**
 * BinanceConnector — read-only.
 *
 * Two endpoints: `/api/v3/account` for the spot wallet and the public
 * `/api/v3/ticker/price` to value it. `/api/v3/order` is never imported, so
 * placing an order is not something this code could do by mistake, and the key
 * it asks for needs only "Enable Reading" — which cannot trade regardless.
 *
 * **This reads the Spot wallet and nothing else.** Binance keeps money in
 * several wallets that do not appear in `/api/v3/account`: Funding, Simple
 * Earn, Futures, and the various locked products. Each has its own signed
 * endpoint and its own response shape, and none of them can be written against
 * anything but a live account without guessing at the reply.
 *
 * Reporting a partial total as if it were whole is the failure this codebase
 * removes most often, so the limit is stated rather than hidden: it is on the
 * connection screen before you connect (see PLATFORM_SETUP.binance.warning).
 * Adding the other wallets is a small job once there is a key to verify them
 * against, and a guess until then.
 *
 * The secret arrives already decrypted from src/lib/crypto and is never logged.
 */

import type { Connector, NormalizedAccountState, NormalizedBalance } from "../types";
import {
  binanceError,
  parseAccountBalances,
  parseTickerPrices,
  priceInDollars,
  signQuery,
  buildQuery,
  isValidApiKey,
} from "./parse";

export const BINANCE_BASE_URL = "https://api.binance.com";

/** How far a request may lag the server's clock before it is rejected. */
const RECV_WINDOW = 5000;

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

export type BinanceGet = (url: string, headers: Record<string, string>) => Promise<unknown>;

export function createBinanceConnector(
  credentials: BinanceCredentials,
  httpGet: BinanceGet = defaultGet,
  baseUrl: string = BINANCE_BASE_URL
): Connector {
  /**
   * A signed GET.
   *
   * The query is built once and both signed and sent, because a signature over
   * one encoding delivered with another is rejected as an invalid signature —
   * which reads exactly like a wrong key and gets diagnosed as one.
   */
  async function callSigned(path: string, params: Record<string, string | number> = {}) {
    const query = buildQuery({
      ...params,
      recvWindow: RECV_WINDOW,
      timestamp: Date.now(),
    });
    const signature = signQuery(query, credentials.apiSecret);

    const payload = await httpGet(`${baseUrl}${path}?${query}&signature=${signature}`, {
      "X-MBX-APIKEY": credentials.apiKey,
    });

    const error = binanceError(payload);
    if (error !== null) throw new Error(`Binance refused ${path}: ${error}`);
    return payload;
  }

  async function callPublic(path: string) {
    const payload = await httpGet(`${baseUrl}${path}`, {});
    const error = binanceError(payload);
    if (error !== null) throw new Error(`Binance refused ${path}: ${error}`);
    return payload;
  }

  return {
    platform: "binance",

    validateIdentifier(identifier: string) {
      if (!isValidApiKey(identifier)) {
        return { ok: false as const, reason: "That doesn't look like a Binance API key" };
      }
      return { ok: true as const };
    },

    async getAccountState(): Promise<NormalizedAccountState> {
      const held = parseAccountBalances(await callSigned("/api/v3/account"));

      /**
       * Prices are fetched only when something needs pricing.
       *
       * The whole ticker is about 150 KB against 16 MB for `exchangeInfo`,
       * which is why symbols are composed from the asset and a dollar quote and
       * looked up here rather than resolved from a pair list. The composition
       * is exact — verified across every spot symbol Binance lists — and it is
       * only ever done in that direction; see the note in parse.ts.
       */
      const prices =
        held.length > 0
          ? parseTickerPrices(await callPublic("/api/v3/ticker/price"))
          : new Map<string, number>();

      const balances: NormalizedBalance[] = held.map((b) => {
        const price = priceInDollars(prices, b.asset);
        return {
          coin: b.asset,
          total: b.total,
          hold: b.hold,
          price,
          // Null stays null. `?? 0` here would drop the row out of every total
          // that reads it, and a portfolio that quietly shrinks gets acted on.
          usdValue: price === null ? null : round2(b.total * price),
          /**
           * Binance does not publish what a spot holding cost. Null, never
           * zero: zero would claim the holding is exactly break-even, and the
           * dashboard reports it as cost unknown instead.
           */
          costBasis: null,
        };
      });

      const spotValue = round2(balances.reduce((sum, b) => sum + (b.usdValue ?? 0), 0));

      return {
        currency: "USD",
        /**
         * The spot wallet, valued in dollars. Binance publishes no single
         * account-equity figure that covers only this wallet, so the sum of
         * what could be priced is the reading — and anything unpriced is
         * excluded from it and marked, rather than counted as nothing.
         */
        equity: spotValue,
        /**
         * Nothing is committed as margin on a spot wallet, but this connector
         * has not asked about the margin account and does not know. Null says
         * "not measured", which is the honest claim.
         */
        withdrawable: null,
        totalMarginUsed: null,
        totalNotionalPosition: null,
        asOf: new Date(),
        positions: [],
        balances,
        spotValue,
        /**
         * `equity` above is the sum of these same coins, so adding the two
         * would count every holding twice.
         */
        balancesAreSeparatePool: false,
      };
    },
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const defaultGet: BinanceGet = async (url, headers) => {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
  /**
   * A 4xx carries the error body, and that body is the useful part: -2015
   * alone means bad key, wrong IP, or missing permission, and only the message
   * says which. So the body is read and handed on rather than thrown away in
   * favour of a status line.
   */
  const payload = await res.json().catch(() => null);
  if (!res.ok && binanceError(payload) === null) {
    throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  }
  return payload;
};
