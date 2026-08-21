/**
 * HyperliquidConnector — read-only.
 *
 * Uses only the public `info` endpoint, which needs nothing but a public
 * wallet address: no API key, no signature, no secret to store. The exchange
 * endpoint (order placement) is deliberately not referenced anywhere.
 */

import { defaultHttpPost, type Connector, type HttpPost, type NormalizedAccountState } from "../types";
import {
  parseClearinghouseState,
  parseSpotBalances,
  looksUnified,
  parseAbstraction,
  isUnifiedAbstraction,
  parsePortfolioValue,
  buildSpotPriceMap,
  parseAllMids,
  parseDexNames,
  mergeMarketStates,
  isValidAddress,
} from "./parse";

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
      const [nativeRaw, spotRaw, spotMetaRaw, dexesRaw, abstractionRaw, portfolioRaw, midsRaw] =
        await Promise.all([
          httpPost(HYPERLIQUID_INFO_URL, { type: "clearinghouseState", user: address }),
          httpPost(HYPERLIQUID_INFO_URL, { type: "spotClearinghouseState", user: address }),
          httpPost(HYPERLIQUID_INFO_URL, { type: "spotMetaAndAssetCtxs" }),
          httpPost(HYPERLIQUID_INFO_URL, { type: "perpDexs" }),
          // Says outright whether spot and perps share one pot.
          httpPost(HYPERLIQUID_INFO_URL, { type: "userAbstraction", user: address }).catch(
            () => null
          ),
          // The venue's own "Portfolio Value", so we stop assembling our own.
          httpPost(HYPERLIQUID_INFO_URL, { type: "portfolio", user: address }).catch(() => null),
          // Prices every coin the venue trades, which the spot metadata does
          // not. Optional: losing it costs a price, not the sync.
          httpPost(HYPERLIQUID_INFO_URL, { type: "allMids" }).catch(() => null),
        ]);

      const native = parseClearinghouseState(nativeRaw);

      /**
       * Each builder-deployed market has to be asked for by name.
       * `dex: "ALL_DEXES"`, which the docs describe, answers HTTP 500, so there
       * is no way to fetch them in one call. A market that fails is skipped
       * rather than failing the whole sync: losing one market's positions is
       * bad, but wiping the account balance over it is worse.
       */
      const dexNames = parseDexNames(dexesRaw);
      const dexStates = await Promise.all(
        dexNames.map(async (dex) => {
          try {
            return parseClearinghouseState(
              await httpPost(HYPERLIQUID_INFO_URL, { type: "clearinghouseState", user: address, dex })
            );
          } catch {
            return null;
          }
        })
      );

      const merged = mergeMarketStates([
        native,
        ...dexStates.filter((s): s is NormalizedAccountState => s !== null),
      ]);

      const { balances, spotValue } = parseSpotBalances(
        spotRaw,
        buildSpotPriceMap(spotMetaRaw),
        parseAllMids(midsRaw)
      );

      /**
       * Spot used to be a pool of its own. Under a unified account it isn't:
       * the spot balance *is* the collateral behind the perps, so reporting
       * both as separate money overstated the account by the whole perps
       * value — 109.91 where the venue itself said 92.49.
       *
       * When unified, the account's value is the spot balance and the perps
       * value is a view of what part of it is deployed, not money beside it.
       */
      /**
       * Unified is now asked, not inferred.
       *
       * The heuristic below (withdrawable exceeding perps equity) stays only as
       * a fallback for when the endpoint can't be reached — it was right about
       * this account but it is a symptom, and the endpoint is the fact.
       */
      const mode = parseAbstraction(abstractionRaw);
      const unified =
        mode !== null
          ? isUnifiedAbstraction(mode)
          : looksUnified({
              equity: merged.equity,
              withdrawable: merged.withdrawable,
              spotValue,
            });

      if (unified) {
        // Read, not composed. Falls back to the spot balance only if the
        // portfolio endpoint failed, which is still better than adding pots.
        const portfolioValue = parsePortfolioValue(portfolioRaw) ?? Math.round((spotValue + Number.EPSILON) * 100) / 100;

        return {
          ...native,
          ...merged,
          equity: portfolioValue,
          /**
           * What the venue says you can trade with. The difference between the
           * two is what is committed to open trades — which is exactly how the
           * app now describes it, rather than deriving margin separately.
           */
          withdrawable: merged.withdrawable,
          /**
           * Committed to open trades = account value − what you can trade with.
           *
           * Under a unified account the perps `totalMarginUsed` describes only
           * the perps sub-account, which is a fraction of the pot backing it.
           * The subtraction is the honest figure and matches what the venue's
           * own screen implies.
           */
          totalMarginUsed:
            merged.withdrawable === null
              ? merged.totalMarginUsed
              : Math.max(
                  0,
                  Math.round(((parsePortfolioValue(portfolioRaw) ?? spotValue) - merged.withdrawable + Number.EPSILON) * 100) / 100
                ),
          balances,
          spotValue,
          // False: the balances are the account, not a second pot.
          balancesAreSeparatePool: false,
        };
      }

      return {
        ...native,
        ...merged,
        balances,
        spotValue,
        balancesAreSeparatePool: true,
      };
    },
  };
}
