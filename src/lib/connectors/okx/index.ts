/**
 * OkxConnector — read-only.
 *
 * One endpoint: `/api/v5/account/balance`. `/api/v5/trade/*` is never
 * imported, so placing an order is not something this code could do by
 * mistake, and the key it asks for needs only the "Read" permission — which
 * cannot trade regardless of what this file does.
 *
 * OKX issues three credentials rather than two: key, secret and a passphrase
 * chosen when the key is created, all three required on every signed request.
 * The passphrase is encrypted at rest exactly like the secret and is never
 * logged.
 *
 * Reads the trading account. Funding is a separate account on OKX with its own
 * endpoint, and the connection screen says so rather than letting a partial
 * total pass for a whole one.
 */

import type { Connector, NormalizedAccountState, NormalizedBalance } from "../types";
import {
  okxError,
  parseAccountBalances,
  parseTotalEquity,
  okxTimestamp,
  signRequest,
  isValidApiKey,
} from "./parse";

export const OKX_BASE_URL = "https://www.okx.com";

export interface OkxCredentials {
  apiKey: string;
  apiSecret: string;
  /** Chosen when the key was created; required on every signed request. */
  passphrase: string;
}

export type OkxGet = (url: string, headers: Record<string, string>) => Promise<unknown>;

export function createOkxConnector(
  credentials: OkxCredentials,
  httpGet: OkxGet = defaultGet,
  baseUrl: string = OKX_BASE_URL
): Connector {
  async function call(requestPath: string) {
    const timestamp = okxTimestamp();

    const payload = await httpGet(`${baseUrl}${requestPath}`, {
      "OK-ACCESS-KEY": credentials.apiKey,
      "OK-ACCESS-SIGN": signRequest({
        timestamp,
        method: "GET",
        requestPath,
        apiSecret: credentials.apiSecret,
      }),
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": credentials.passphrase,
      "Content-Type": "application/json",
    });

    /**
     * Checked before anything is read. `code` is a string and success is
     * `"0"`, so neither a truthy nor a falsy test gives the right answer —
     * and the wrong answer is an account that appears to hold nothing.
     */
    const error = okxError(payload);
    if (error !== null) throw new Error(`OKX refused ${requestPath}: ${error}`);
    return payload;
  }

  return {
    platform: "okx",

    validateIdentifier(identifier: string) {
      if (!isValidApiKey(identifier)) {
        return { ok: false as const, reason: "That doesn't look like an OKX API key" };
      }
      return { ok: true as const };
    },

    async getAccountState(): Promise<NormalizedAccountState> {
      const reply = await call("/api/v5/account/balance");

      const held = parseAccountBalances(reply);
      const totalEquity = parseTotalEquity(reply);

      const balances: NormalizedBalance[] = held.map((b) => ({
        coin: b.currency,
        total: b.total,
        hold: b.hold,
        /**
         * Derived from the venue's own valuation rather than a ticker lookup,
         * so this app and OKX's own screen cannot disagree about what a
         * holding is worth. Null stays null: an unpriced holding counted as
         * nothing is a portfolio that quietly shrinks.
         */
        price: b.usdValue === null || b.total === 0 ? null : b.usdValue / b.total,
        usdValue: b.usdValue,
        /**
         * OKX does not publish what a spot holding cost. Null, never zero —
         * zero would claim the position is exactly break-even, and the
         * dashboard reports it as cost unknown instead.
         */
        costBasis: null,
      }));

      const spotValue = round2(balances.reduce((sum, b) => sum + (b.usdValue ?? 0), 0));

      return {
        currency: "USD",
        /**
         * `totalEq` is OKX's own total and covers currencies this app may not
         * have a value for, so it is the better reading of the account. The
         * sum of the parts is the fallback when the venue does not state one.
         */
        equity: totalEquity ?? spotValue,
        /**
         * Not asked for. OKX reports availability per currency and per account
         * mode, and a single "withdrawable" would be this connector's summary
         * rather than the venue's statement. Null says not measured.
         */
        withdrawable: null,
        totalMarginUsed: null,
        totalNotionalPosition: null,
        asOf: new Date(),
        positions: [],
        balances,
        spotValue,
        /**
         * `equity` above is OKX's valuation of these same balances, so adding
         * the two would count every holding twice.
         */
        balancesAreSeparatePool: false,
      };
    },
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const defaultGet: OkxGet = async (url, headers) => {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
  /**
   * The body is read whatever the status. OKX puts its reason in `msg` and its
   * code in `code`, and a 400 with "Invalid Sign" in the body is far more
   * useful than the status line — the caller checks the envelope either way.
   */
  const payload = await res.json().catch(() => null);
  if (!res.ok && okxError(payload) === null) {
    throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  }
  return payload;
};
