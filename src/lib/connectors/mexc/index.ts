/**
 * MexcConnector — read-only, across two wallets that share nothing but a login.
 *
 * Spot is `api.mexc.com`: a query-string signature, a bare reply, coins.
 * Futures is `contract.mexc.com`: a header signature over
 * `accessKey + timestamp + params`, a `{success, code, data}` envelope, and
 * positions measured in contracts rather than coins. The two are kept apart in
 * `./parse` and `./futures` because nothing about them is the same — see the
 * note in `./futures` for the four facts that produce a plausible number rather
 * than an error when they are assumed instead of read.
 *
 * No order endpoint is imported from either host, so placing a trade is not
 * something this code could do by mistake, and the key it asks for needs only
 * read permissions — which cannot trade regardless.
 *
 * **The futures half is allowed to fail on its own.** MEXC has restricted
 * futures API access for years, and a key that cannot reach it is common; when
 * that happens the spot reading still stands rather than the whole sync dying.
 * Savings, Staking and the launchpad products remain unread — separate again,
 * and stated on the connection screen rather than hidden.
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
import {
  contractError,
  futuresSignature,
  sortedQuery,
  parseFuturesAssets,
  parseContractSizes,
  parseOpenPositions,
  parseHistoryPositions,
  settlementRate,
} from "./futures";

export const MEXC_BASE_URL = "https://api.mexc.com";
/** Futures live on their own host, with their own auth and envelope. */
export const MEXC_CONTRACT_URL = "https://contract.mexc.com";
/** MEXC's cap is 100. One page is the recent history; the rest is an import. */
const HISTORY_PAGE_SIZE = 100;

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
  baseUrl: string = MEXC_BASE_URL,
  contractUrl: string = MEXC_CONTRACT_URL
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

  /**
   * A signed GET against the futures host.
   *
   * Different in every respect from the spot call above: the signature covers
   * `accessKey + timestamp + params` rather than the query string, it travels
   * in headers rather than in the URL, and the reply is checked against the
   * `{success, code, data}` envelope instead of a bare `msg`.
   */
  async function callFutures(path: string, params: Record<string, string | number> = {}) {
    const requestTime = String(Date.now());
    // Dictionary order, which is the order MEXC signs — not insertion order.
    const query = sortedQuery(params);
    const signature = futuresSignature(
      credentials.apiKey,
      credentials.apiSecret,
      requestTime,
      query
    );

    const payload = await httpGet(`${contractUrl}${path}${query ? `?${query}` : ""}`, {
      ApiKey: credentials.apiKey,
      "Request-Time": requestTime,
      Signature: signature,
      "Content-Type": "application/json",
    });

    const error = contractError(payload);
    if (error !== null) throw new Error(`MEXC futures refused ${path}: ${error}`);
    return payload;
  }

  async function callFuturesPublic(path: string) {
    const payload = await httpGet(`${contractUrl}${path}`, {});
    const error = contractError(payload);
    if (error !== null) throw new Error(`MEXC futures refused ${path}: ${error}`);
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
       * The futures account, read before prices because it decides whether any
       * are needed. On this venue it is usually where the money is.
       *
       * Allowed to fail on its own: MEXC has restricted futures API access for
       * years and a key that cannot reach it is common. When that happens the
       * spot reading still stands rather than the whole sync failing — a
       * partial answer that says what it covers beats no answer at all.
       */
      const futures = await readFutures();

      /**
       * Fetched only when something actually needs pricing.
       *
       * `priceInDollars` answers for USDT and USDC from the peg alone, so an
       * account holding nothing but USDT futures margin — the ordinary case
       * here — never pays for the ticker. It is fetched when spot holds coins,
       * or when futures settles in something that is not a dollar.
       *
       * Symbols are composed from the asset and a dollar quote rather than
       * resolved from a pair list; see the note on `priceInDollars` for why
       * that direction is the safe one.
       */
      const needsPricing =
        held.length > 0 ||
        futures.assets.some(
          (a) => settlementRate(a.currency, (c) => priceInDollars(new Map(), c)) === null
        );
      const prices = needsPricing
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

      /**
       * Every futures figure, in dollars.
       *
       * `assets` is one row per settlement currency, and adding them raw would
       * be adding different currencies — which this codebase forbids outright.
       * USDT and USDC are dollars by peg; anything else is priced through the
       * spot ticker.
       *
       * A currency that cannot be priced is left out of the totals and added to
       * `balances` with a null value instead, so it is visible as a holding of
       * unknown worth rather than silently absent. Excluding it is not the same
       * as it being nothing, and the app already renders that distinction.
       */
      let futuresEquity = 0;
      let futuresAvailable = 0;
      let futuresMargin = 0;

      for (const asset of futures.assets) {
        const rate = settlementRate(asset.currency, (c) => priceInDollars(prices, c));

        /**
         * The collateral, listed as the holding it is.
         *
         * Without this row the futures account reached Net Worth through
         * `equity` and appeared in no chart at all: the portfolio view is built
         * from holdings, open positions and balances, and an account with none
         * of the three contributes nothing to look at. 36.06 USDT of collateral
         * was real money at a venue, counted in the total and invisible in
         * every breakdown of it.
         *
         * `countsInPortfolio: false` is what keeps it honest — this is
         * `equity` itemised, not money beside it, so it is shown and never
         * added on top. The same thing IBKR does with the euros inside its
         * `netliquidationvalue`.
         */
        balances.push({
          coin: asset.currency,
          total: asset.equity,
          // What is backing open trades and cannot be withdrawn.
          hold: asset.positionMargin,
          price: rate,
          usdValue: rate === null ? null : round2(asset.equity * rate),
          /**
           * A stablecoin's cost is not knowable from a balance, and zero would
           * claim it is exactly break-even.
           */
          costBasis: null,
          countsInPortfolio: false,
        });

        // A currency with no price is left out of the totals and stays visible
        // above as a holding of unknown worth. Excluded is not the same as nil.
        if (rate === null) continue;

        futuresEquity += asset.equity * rate;
        futuresAvailable += asset.available * rate;
        futuresMargin += asset.positionMargin * rate;
      }

      /**
       * The spot wallet, and only that.
       *
       * `balances` now also carries the futures collateral, which is `equity`
       * itemised rather than money beside it — so summing every row here would
       * report the same 36.06 twice, and the connections screen would read
       * "account value 36.06 + coins 36.06 = 72.12". Rows that declare
       * themselves inside the equity are excluded, which is the same rule the
       * `countsInPortfolio` flag states.
       */
      const spotValue = round2(
        balances
          .filter((b) => b.countsInPortfolio !== false)
          .reduce((sum, b) => sum + (b.usdValue ?? 0), 0)
      );

      return {
        currency: "USD",
        /**
         * The futures account's equity, and only that.
         *
         * MEXC's `equity` already contains the unrealised profit of every open
         * position, so positions are never added on top. Spot is separate money
         * and is reported below as `spotValue` with `balancesAreSeparatePool`,
         * which is what tells the app to add it rather than assume it is a
         * breakdown of this figure.
         */
        equity: round2(futuresEquity),
        withdrawable: futures.reachable ? round2(futuresAvailable) : null,
        totalMarginUsed: futures.reachable ? round2(futuresMargin) : null,
        totalNotionalPosition: null,
        activity: futures.activity,
        asOf: new Date(),
        positions: futures.positions,
        balances,
        spotValue,
        /**
         * Spot coins sit outside the futures equity above — two separate pools
         * on this venue, so they add rather than double count. This was `false`
         * when the connector read spot alone and `equity` *was* the coins.
         */
        balancesAreSeparatePool: true,
      };

      /**
       * Everything the futures side can say, or an empty reading.
       *
       * Deliberately swallows its own failure. The alternative is a sync that
       * dies whole because one of two wallets is not permitted, which would
       * leave the account showing nothing at all — and this venue restricts
       * futures API access often enough that it cannot be treated as a fault.
       */
      async function readFutures() {
        const empty = {
          reachable: false,
          assets: [] as ReturnType<typeof parseFuturesAssets>,
          positions: [] as NormalizedAccountState["positions"],
          activity: undefined as NormalizedAccountState["activity"],
        };

        try {
          const assets = parseFuturesAssets(await callFutures("/api/v1/private/account/assets"));

          /**
           * Contract sizes first, because a position is measured in contracts
           * and one contract is 0.0001 BTC. Public, so it costs no permission.
           */
          const sizes = parseContractSizes(await callFuturesPublic("/api/v1/contract/detail"));
          const open = parseOpenPositions(
            await callFutures("/api/v1/private/position/open_positions"),
            sizes
          );

          /**
           * Closed positions are the trade history. Failing here must not lose
           * the balance that was already read — history is the part that
           * accumulates, and it can be caught up on the next sync.
           */
          let activity: NormalizedAccountState["activity"];
          try {
            activity = parseHistoryPositions(
              await callFutures("/api/v1/private/position/list/history_positions", {
                page_num: 1,
                page_size: HISTORY_PAGE_SIZE,
              }),
              sizes
            );
          } catch {
            activity = undefined;
          }

          return { reachable: true, assets, positions: open.positions, activity };
        } catch {
          return empty;
        }
      }
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
