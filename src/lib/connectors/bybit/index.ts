/**
 * BybitConnector — read-only.
 *
 * Only two endpoints are referenced, both GET: wallet balance and position
 * list. /v5/order/* is never imported, so placing an order isn't something
 * this code could do by mistake (PRODUCT_VISION §4).
 *
 * Unlike Hyperliquid this needs credentials, so the secret arrives already
 * decrypted from src/lib/crypto and is never logged.
 */

import type { Connector, HttpGetSigned, NormalizedAccountState } from "../types";
import { buildQuery, signRequest, parseWalletBalance, parsePositions, isValidApiKey } from "./parse";

/** Default host. A connection may target the EEA entity instead — see
 * BYBIT_REGIONS in ../constants. */
export const BYBIT_BASE_URL = "https://api.bybit.eu";
const RECV_WINDOW = 5000;

export interface BybitCredentials {
  apiKey: string;
  apiSecret: string;
}

/**
 * Settlement coins to ask for. Bybit requires either a symbol or a settleCoin
 * for linear positions, so we sweep the ones that actually carry positions
 * rather than asking for "everything", which the API doesn't support.
 */
const LINEAR_SETTLE_COINS = ["USDT", "USDC"];

export function createBybitConnector(
  credentials: BybitCredentials,
  httpGet: HttpGetSigned = defaultSignedGet,
  baseUrl: string = BYBIT_BASE_URL
): Connector {
  async function call(path: string, params: Record<string, string | undefined>): Promise<unknown> {
    const query = buildQuery(params);
    const timestamp = Date.now();
    const signature = signRequest(
      timestamp,
      credentials.apiKey,
      RECV_WINDOW,
      query,
      credentials.apiSecret
    );

    return httpGet(`${baseUrl}${path}${query ? `?${query}` : ""}`, {
      "X-BAPI-API-KEY": credentials.apiKey,
      "X-BAPI-TIMESTAMP": String(timestamp),
      "X-BAPI-RECV-WINDOW": String(RECV_WINDOW),
      "X-BAPI-SIGN": signature,
    });
  }

  return {
    platform: "bybit",

    validateIdentifier(identifier: string) {
      if (!isValidApiKey(identifier)) {
        return { ok: false as const, reason: "That doesn't look like a Bybit API key" };
      }
      return { ok: true as const };
    },

    async getAccountState(): Promise<NormalizedAccountState> {
      const wallet = parseWalletBalance(
        await call("/v5/account/wallet-balance", { accountType: "UNIFIED" })
      );

      // Linear positions need a settle coin; inverse can be asked for wholesale.
      const positionResponses = await Promise.all([
        ...LINEAR_SETTLE_COINS.map((settleCoin) =>
          call("/v5/position/list", { category: "linear", settleCoin, limit: "200" })
        ),
        call("/v5/position/list", { category: "inverse", limit: "200" }),
      ]);

      const positions = positionResponses.flatMap(parsePositions);

      return {
        // Equity already contains the unrealised P&L of these positions, so
        // they are reported but never added on top (PRODUCT_VISION §9).
        equity: wallet.totalEquity,
        withdrawable: wallet.availableBalance,
        totalMarginUsed: wallet.totalInitialMargin,
        totalNotionalPosition: positions.reduce((s, p) => s + (p.positionValue ?? 0), 0),
        asOf: new Date(),
        positions,
        balances: wallet.balances,
        spotValue: wallet.spotValue,
        // A unified account is one pot: these coins are a breakdown of the
        // equity above, not extra money.
        balancesAreSeparatePool: false,
      };
    },
  };
}

const defaultSignedGet: HttpGetSigned = async (url, headers) => {
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  }
  return res.json();
};
