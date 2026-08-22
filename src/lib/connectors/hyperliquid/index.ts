/**
 * HyperliquidConnector — read-only.
 *
 * Uses only the public `info` endpoint, which needs nothing but a public
 * wallet address: no API key, no signature, no secret to store. The exchange
 * endpoint (order placement) is deliberately not referenced anywhere.
 */

import { defaultHttpPost, type Connector, type HttpPost, type NormalizedAccountState } from "../types";
import { fillsToActivity } from "./fills";
import {
  parseClearinghouseState,
  parseSpotBalances,
  looksUnified,
  parseAbstraction,
  isUnifiedAbstraction,
  parsePortfolioValue,
  buildSpotPriceMap,
  parseAllMids,
  parseRealizedPnl,
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
      const [
        nativeRaw,
        spotRaw,
        spotMetaRaw,
        dexesRaw,
        abstractionRaw,
        portfolioRaw,
        midsRaw,
        fillsRaw,
      ] = await Promise.all([
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
          // Closed trades. `clearinghouseState` only describes what is still
          // open, so without this a trade you closed left no trace at all.
          // Optional for the same reason as the others.
          httpPost(HYPERLIQUID_INFO_URL, { type: "userFills", user: address }).catch(() => null),
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

      const { balances, spotValue, heldValue } = parseSpotBalances(
        spotRaw,
        buildSpotPriceMap(spotMetaRaw),
        parseAllMids(midsRaw)
      );

      // What closed trades actually made or lost. Null when the venue said
      // nothing, which the interface reports as unknown rather than as zero.
      const { realized } = parseRealizedPnl(fillsRaw);
      // The same fills as individual events, which is what a trade history is.
      // Hyperliquid quotes everything against USD stablecoins.
      const activity = fillsToActivity(fillsRaw, "USD");

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

        /**
         * Margin is read, not derived from `withdrawable`.
         *
         * It used to be `portfolioValue − withdrawable`, on the reasoning that
         * the perps `totalMarginUsed` describes only the perps sub-account and
         * so understates the pot behind it. That reasoning depended on
         * `withdrawable` describing the whole balance, and on a unified account
         * it does not: the perps sub-account holds no free collateral of its
         * own — everything lives in spot — so the venue answers **0.0**.
         *
         * Fed through the subtraction, that zero declared the entire balance
         * committed: 149,29 € of "margin in use" against one open trade tying
         * up 9,15 €, and 0 € reported as free when about 140 € was. A zero that
         * means "not applicable here" was read as a measurement, which is the
         * same mistake in the same connector as the HYPE price.
         *
         * The perps summary reports 10.708233 committed and the spot USDC
         * balance shows exactly 10.708233 on `hold` — two endpoints, one
         * answer. `heldValue` is that second reading, used when the perps
         * summary is missing rather than trusted over it.
         */
        const marginUsed = merged.totalMarginUsed ?? (heldValue > 0 ? heldValue : null);

        return {
          ...native,
          ...merged,
          equity: portfolioValue,
          /**
           * Free = the pot minus what is held against open trades, so that
           * `withdrawable + totalMarginUsed` adds back to the account value.
           * An identity that has to hold is one a wrong number cannot hide in.
           */
          withdrawable:
            marginUsed === null
              ? merged.withdrawable
              : Math.max(0, Math.round((portfolioValue - marginUsed + Number.EPSILON) * 100) / 100),
          totalMarginUsed: marginUsed,
          realizedPnl: realized,
          activity,
          balances,
          spotValue,
          // False: the balances are the account, not a second pot.
          balancesAreSeparatePool: false,
        };
      }

      return {
        ...native,
        ...merged,
        realizedPnl: realized,
        activity,
        balances,
        spotValue,
        balancesAreSeparatePool: true,
      };
    },
  };
}
