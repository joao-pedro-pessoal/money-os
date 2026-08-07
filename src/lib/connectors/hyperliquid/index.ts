/**
 * HyperliquidConnector — read-only.
 *
 * Uses only the public `info` endpoint, which needs nothing but a public
 * wallet address: no API key, no signature, no secret to store. The exchange
 * endpoint (order placement) is deliberately not referenced anywhere.
 */

import { defaultHttpPost, type Connector, type HttpPost, type NormalizedAccountState } from "../types";
import { parseClearinghouseState, parseSpotBalances, buildSpotPriceMap, isValidAddress } from "./parse";

export const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

export function createHyperliquidConnector(httpPost: HttpPost = defaultHttpPost): Connector {
  return {
    platform: "hyperliquid",

    validateIdentifier(identifier: string) {
      if (!isValidAddress(identifier)) {
        return {
          ok: false as const,
          reason: "Expected a 42-character wallet address starting with 0x",
        };
      }
      return { ok: true as const };
    },

    async getAccountState(identifier: string): Promise<NormalizedAccountState> {
      const address = identifier.trim();
      if (!isValidAddress(address)) {
        throw new Error("Invalid Hyperliquid address");
      }
      // Perps account (equity + open positions) and the spot pool are separate
      // on Hyperliquid, so both are needed for a complete picture.
      const [perpsRaw, spotRaw, spotMetaRaw] = await Promise.all([
        httpPost(HYPERLIQUID_INFO_URL, { type: "clearinghouseState", user: address }),
        httpPost(HYPERLIQUID_INFO_URL, { type: "spotClearinghouseState", user: address }),
        httpPost(HYPERLIQUID_INFO_URL, { type: "spotMetaAndAssetCtxs" }),
      ]);

      const state = parseClearinghouseState(perpsRaw);
      const { balances, spotValue } = parseSpotBalances(spotRaw, buildSpotPriceMap(spotMetaRaw));

      return { ...state, balances, spotValue };
    },
  };
}
