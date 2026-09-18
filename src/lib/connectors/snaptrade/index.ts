/**
 * SnapTradeConnector — read-only, with your own SnapTrade Personal key.
 *
 * Three GET endpoints are referenced and nothing else:
 *
 *   /accounts                          the brokerage accounts you linked
 *   /accounts/{id}/positions/all       what each one holds
 *   /accounts/{id}/balances            its cash
 *
 * A SnapTrade key can also place orders at brokers that allow it. Those paths
 * live under /trade and /accounts/{id}/trading and are not referenced anywhere
 * in this codebase, so ordering is not a capability that exists to be reached
 * by mistake (PRODUCT_VISION §4). The key itself is more powerful than a
 * read-only exchange key, which the setup text says before it is pasted.
 *
 * All linked accounts are read as one connection. They must share a currency:
 * a total in euros and one in dollars cannot be added without a rate, and a
 * connector holds none — so a mixed set fails with that explanation instead
 * of producing a number in no currency.
 */

import type { Connector, NormalizedAccountState, NormalizedPosition, NormalizedBalance } from "../types";
import {
  SNAPTRADE_BASE_URL,
  authQuery,
  cashBalances,
  explainSnapTradeError,
  parseAccounts,
  parseCash,
  parsePositions,
  signRequest,
} from "./parse";

export interface SnapTradeCredentials {
  clientId: string;
  consumerKey: string;
}

/** A signed GET: the full URL and the Signature header. Injected for tests. */
export type SnapGet = (url: string, headers: Record<string, string>) => Promise<unknown>;

const defaultGet: SnapGet = async (url, headers) => {
  const res = await fetch(url, { method: "GET", headers: { ...headers, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    throw new Error(explainSnapTradeError(res.status, body));
  }
  return res.json();
};

export function createSnapTradeConnector(
  credentials: SnapTradeCredentials,
  get: SnapGet = defaultGet,
  baseUrl: string = SNAPTRADE_BASE_URL,
  now: () => Date = () => new Date()
): Connector {
  function call(path: string): Promise<unknown> {
    const query = authQuery(credentials.clientId, now());
    return get(`${baseUrl}${path}?${query}`, { Signature: signRequest(credentials.consumerKey, path, query) });
  }

  return {
    platform: "snaptrade",

    validateIdentifier(identifier: string) {
      if (!/^[A-Za-z0-9_-]{4,}$/.test(identifier.trim())) {
        return { ok: false as const, reason: "That doesn't look like a SnapTrade Client ID — copy it from your SnapTrade Personal dashboard" };
      }
      return { ok: true as const };
    },

    async getAccountState(): Promise<NormalizedAccountState> {
      const accounts = parseAccounts(await call("/accounts"));
      if (accounts.length === 0) {
        throw new Error("SnapTrade shows no open brokerage accounts. Link a broker in your SnapTrade dashboard first.");
      }
      const currencies = [...new Set(accounts.map((a) => a.currency).filter((c): c is string => c !== null))];
      if (currencies.length > 1) {
        throw new Error(
          `Your SnapTrade accounts are in several currencies (${currencies.join(", ")}). They cannot be added without an exchange rate, so this connection reads nothing rather than a total in no currency.`
        );
      }
      const currency = currencies[0] ?? "USD";

      let equity = 0;
      let withdrawable = 0;
      const positions: NormalizedPosition[] = [];
      const balances: NormalizedBalance[] = [];
      for (const account of accounts) {
        const path = `/accounts/${encodeURIComponent(account.id)}`;
        const held = parsePositions(await call(`${path}/positions/all`), currency);
        const cash = parseCash(await call(`${path}/balances`));
        positions.push(...held);
        balances.push(...cashBalances(cash, currency));
        const cashHere = cash.filter((c) => c.currency === currency).reduce((s, c) => s + c.cash, 0);
        withdrawable += cashHere;
        if (account.total !== null) {
          equity += account.total;
        } else {
          // No stated total: cash plus what is held, only when every part is in
          // the account's currency — otherwise the gap is reported, not filled.
          const unvalued = held.filter((p) => p.positionValue === null);
          if (unvalued.length > 0 || cash.some((c) => c.currency !== currency)) {
            throw new Error(
              `SnapTrade gave no total for ${account.institution} and part of it is in another currency, so its value cannot be worked out here.`
            );
          }
          equity += cashHere + held.reduce((s, p) => s + (p.side === "short" ? -1 : 1) * (p.positionValue ?? 0), 0);
        }
      }

      return {
        currency,
        equity,
        withdrawable,
        totalMarginUsed: null,
        totalNotionalPosition: null,
        realizedPnl: null,
        asOf: null,
        positions,
        balances,
        spotValue: balances.reduce((s, b) => s + (b.usdValue ?? 0), 0),
        // Cash is part of each account's stated total, not money beside it.
        balancesAreSeparatePool: false,
      };
    },
  };
}
