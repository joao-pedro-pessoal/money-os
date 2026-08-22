/**
 * Trading212Connector — read-only.
 *
 * Two GET endpoints are referenced and nothing else:
 *
 *   /api/v0/equity/account/summary    the account's money
 *   /api/v0/equity/positions          what it holds
 *
 * Trading 212's API can place market, limit, stop and stop-limit orders, and
 * cancel them. Those paths live under /equity/orders and are not imported
 * anywhere in this codebase, so ordering isn't a capability that exists to be
 * reached by mistake (PRODUCT_VISION §4).
 *
 * Two constraints from the published reference shape this file:
 *
 *  - Authentication is HTTP Basic: the key is the username, the secret is the
 *    password. An older scheme accepted the key bare in `Authorization`, and a
 *    modern key pair answers that with 401.
 *  - The summary endpoint allows one call every five seconds *per account*,
 *    regardless of key or IP. So this makes exactly two calls per sync.
 */

import type {
  Connector,
  HttpGetSigned,
  NormalizedAccountState,
  NormalizedDividend,
} from "../types";
import {
  parseAccountSummary,
  parsePositions,
  parseInstruments,
  parseDividends,
  nextPagePath,
  explainHttpError,
  isValidApiKey,
  basicAuthHeader,
  type InstrumentInfo,
} from "./parse";

/**
 * The instrument catalogue, cached across syncs.
 *
 * It is thousands of rows and rate-limited to one call every fifty seconds,
 * so fetching it on every sync would spend the budget on data that changes
 * daily at most. Cached per account for an hour, and — importantly — a failure
 * to refresh it never fails the sync: the balance and the positions matter
 * more than the labels on them.
 */
interface CatalogueEntry {
  instruments: Map<string, InstrumentInfo>;
  fetchedAt: number;
}

const catalogue = new Map<string, CatalogueEntry>();
const CATALOGUE_TTL_MS = 60 * 60 * 1000;

/** Fifty rows a page, so this covers a very long history and still terminates. */
const MAX_HISTORY_PAGES = 40;

/** Exported for tests, which must not inherit state from each other. */
export function clearInstrumentCache(): void {
  catalogue.clear();
}

/** Real money. The practice environment is demo.trading212.com. */
export const T212_LIVE_BASE_URL = "https://live.trading212.com/api/v0";
export const T212_DEMO_BASE_URL = "https://demo.trading212.com/api/v0";

export interface Trading212Credentials {
  apiKey: string;
  apiSecret: string;
}

export const defaultSignedGet: HttpGetSigned = async (url, headers) => {
  const res = await fetch(url, { method: "GET", headers: { ...headers, Accept: "application/json" } });

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    throw new Error(explainHttpError(res.status, body));
  }

  return res.json();
};

/**
 * The catalogue, from cache when it's fresh enough.
 *
 * Never throws. If Trading 212 rate-limits or fails this call, the previous
 * copy is used, and an empty map if there isn't one — positions then arrive
 * unclassified and get their type on a later sync. Losing the labels is a
 * nuisance; losing the balance because of the labels would be a bug.
 */
async function loadInstruments(
  cacheKey: string,
  call: (path: string) => Promise<unknown>
): Promise<Map<string, InstrumentInfo>> {
  const cached = catalogue.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CATALOGUE_TTL_MS) {
    return cached.instruments;
  }

  try {
    const instruments = parseInstruments(await call("/equity/metadata/instruments"));
    // An empty catalogue means something went wrong upstream; keeping the old
    // one is better than replacing good labels with none.
    if (instruments.size === 0 && cached) return cached.instruments;

    catalogue.set(cacheKey, { instruments, fetchedAt: Date.now() });
    return instruments;
  } catch {
    return cached?.instruments ?? new Map();
  }
}

export function createTrading212Connector(
  credentials: Trading212Credentials,
  httpGet: HttpGetSigned = defaultSignedGet,
  baseUrl: string = T212_LIVE_BASE_URL
): Connector {
  function call(path: string): Promise<unknown> {
    return httpGet(`${baseUrl}${path}`, {
      Authorization: basicAuthHeader(credentials.apiKey, credentials.apiSecret),
    });
  }

  return {
    platform: "trading212",

    validateIdentifier(identifier: string) {
      if (!isValidApiKey(identifier)) {
        return {
          ok: false as const,
          reason: "That doesn't look like a Trading 212 API key — it should be one unbroken string",
        };
      }
      return { ok: true as const };
    },

    async getAccountState(): Promise<NormalizedAccountState> {
      // The summary first: on bad credentials the tighter-limited call fails
      // and the rest is never spent against the rate limit.
      const summary = parseAccountSummary(await call("/equity/account/summary"));
      const instruments = await loadInstruments(credentials.apiKey, call);
      const positions = parsePositions(await call("/equity/positions"), instruments);

      /**
       * `totalValue` already contains what every position is worth.
       *
       * Stated rather than inferred, because this is the distinction that has
       * gone wrong six times in this codebase: the positions below are a
       * breakdown of equity, not money sitting beside it.
       */
      return {
        // Trading 212 reports in the account's primary currency, not USD.
        currency: summary.currency ?? "EUR",
        equity: summary.total,
        withdrawable: summary.free,
        totalMarginUsed: null,
        // Trading 212 states this outright, so it is reported rather than
        // reconstructed. It is account-wide and all-time, not per position.
        realizedPnl: summary.realised,
        totalNotionalPosition: positions.reduce((sum, p) => sum + (p.positionValue ?? 0), 0),
        asOf: new Date(),
        positions,
        // Uninvested cash shown as a balance so it appears in the breakdown;
        // the flag below says it must not be added to equity again.
        balances:
          summary.free === null
            ? []
            : [
                {
                  coin: summary.currency ?? "EUR",
                  total: summary.free,
                  hold: 0,
                  price: 1,
                  usdValue: summary.free,
                  // Free cash, so there is no cost basis to speak of.
                  costBasis: null,
                },
              ],
        spotValue: summary.free ?? 0,
        // False: free cash is part of totalValue. Same as a Bybit unified
        // account, unlike Hyperliquid's separate spot pool.
        balancesAreSeparatePool: false,
      };
    },

    /**
     * Every distribution ever paid, walked page by page.
     *
     * Paged rather than capped: the point of this history is the *pattern*, and
     * a truncated history infers the wrong rhythm — three quarterly payments
     * look annual if the fourth was cut off. The endpoint allows six calls a
     * minute and pages are fifty, so a long history costs a few seconds.
     *
     * The page count is bounded anyway. An endless `nextPagePath` — a bug on
     * either side — must not become an infinite loop against a live API.
     */
    async getDividends() {
      const all: NormalizedDividend[] = [];
      let path: string | null = "/equity/history/dividends?limit=50";

      for (let page = 0; page < MAX_HISTORY_PAGES && path !== null; page++) {
        const payload: unknown = await call(path);
        all.push(...parseDividends(payload));

        const next = nextPagePath(payload);
        // The API returns a full path including /api/v0, which baseUrl already
        // carries — appending it whole would ask for /api/v0/api/v0/…
        path = next === null ? null : next.replace(/^\/api\/v0/, "");
      }

      return all;
    },
  };
}
