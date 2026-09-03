/**
 * MexcConnector — read-only.
 *
 * Two endpoints: `/api/v3/account` for the spot wallet and the public
 * `/api/v3/ticker/price` to value it. `/api/v3/order` is never imported, so
 * placing an order is not something this code could do by mistake, and the key
 * it asks for needs only the read permission — which cannot trade regardless.
 *
 * **This reads the Spot wallet and nothing else.** MEXC keeps money in other
 * places that do not appear in `/api/v3/account`: Futures has its own API with
 * its own host and response shapes, and Savings, Staking and the various
 * launchpad products are separate again. None can be written against without a
 * live account to check the reply, so the limit is stated on the connection
 * screen rather than hidden (see PLATFORM_SETUP.mexc.warning).
 *
 * The secret arrives already decrypted from src/lib/crypto and is never logged.
 */

import type { Connector, NormalizedAccountState, NormalizedBalance } from "../types";
import {
  mexcError,
  parseAccountBalances,
  parseTickerPrices,
  priceInDollars,
  signQuery,
  buildQuery,
  isValidApiKey,
} from "./parse";

export const MEXC_BASE_URL = "https://api.mexc.com";

/** How far a request may lag the server's clock before it is rejected. */
const RECV_WINDOW = 5000;

export interface MexcCredentials {
  apiKey: string;
  apiSecret: string;
}

export type MexcGet = (url: string, headers: Record<string, string>) => Promise<unknown>;

export function createMexcConnector(
  credentials: MexcCredentials,
  httpGet: MexcGet = defaultGet,
  baseUrl: string = MEXC_BASE_URL
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
      // Binance calls this X-MBX-APIKEY. Same request, different header name;
      // sending Binance's spelling authenticates nothing here.
      "X-MEXC-APIKEY": credentials.apiKey,
    });

    const error = mexcError(payload);
    if (error !== null) throw new Error(`MEXC refused ${path}: ${error}`);
    return payload;
  }

  async function callPublic(path: string) {
    const payload = await httpGet(`${baseUrl}${path}`, {});
    const error = mexcError(payload);
    if (error !== null) throw new Error(`MEXC refused ${path}: ${error}`);
    return payload;
  }

  return {
    platform: "mexc",

    validateIdentifier(identifier: string) {
      if (!isValidApiKey(identifier)) {
        return { ok: false as const, reason: "That doesn't look like a MEXC API key" };
      }
      return { ok: true as const };
    },

    async getAccountState(): Promise<NormalizedAccountState> {
      const held = parseAccountBalances(await callSigned("/api/v3/account"));

      /**
       * Prices are fetched only when something needs pricing, and symbols are
       * composed from the asset and a dollar quote rather than resolved from a
       * pair list — see the note on `priceInDollars` for why that direction is
       * the safe one even on a venue whose symbol list nobody has audited.
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
           * MEXC does not publish what a spot holding cost. Null, never zero:
           * zero would claim the holding is exactly break-even, and the
           * dashboard reports it as cost unknown instead.
           */
          costBasis: null,
        };
      });

      const spotValue = round2(balances.reduce((sum, b) => sum + (b.usdValue ?? 0), 0));

      return {
        currency: "USD",
        /**
         * The spot wallet, valued in dollars. MEXC publishes no single
         * account-equity figure covering only this wallet, so the sum of what
         * could be priced is the reading — and anything unpriced is excluded
         * from it and marked, rather than counted as nothing.
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

const defaultGet: MexcGet = async (url, headers) => {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
  /**
   * A 4xx carries the error body, and that body is the useful part: the code
   * alone distinguishes a bad key from a bad signature from a blocked IP, and
   * only the message says which. So the body is read and handed on rather than
   * thrown away in favour of a status line.
   */
  const payload = await res.json().catch(() => null);
  if (!res.ok && mexcError(payload) === null) {
    throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  }
  return payload;
};
