/**
 * IbkrConnector — read-only.
 *
 * Interactive Brokers works differently from the exchanges: this code never
 * contacts IB. A Client Portal Gateway runs on your own machine, you log into
 * it through a browser, and these calls go to that local gateway, which
 * forwards them. Consequences worth knowing:
 *
 *  - There is no API key, so nothing secret is stored for this platform.
 *  - The session expires and must be renewed in the browser. That is IBKR's
 *    design, not a fault, and the error message says so.
 *  - IBKR allows one session per username across all its platforms, so having
 *    Trader Workstation open will break syncing.
 *
 * Only /portfolio and read-only /iserver/auth endpoints are referenced. Order
 * placement lives under /iserver/account/{id}/orders and is never imported.
 */

import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import type { Connector, NormalizedAccountState } from "../types";
import {
  parseAccounts,
  parseAuthStatus,
  parseLedger,
  parsePositions,
  authProblem,
  isValidAccountId,
  normalizeAccountId,
} from "./parse";

/** Where the gateway listens by default once you run it. */
export const IBKR_DEFAULT_GATEWAY = "https://localhost:5000/v1/api";

/**
 * Most gateway endpoints are GET, but /iserver/auth/status is POST — asking it
 * with GET returns an empty body, which reads as "not logged in" even when the
 * session is perfectly alive.
 */
export type IbkrGet = (path: string, method?: "GET" | "POST") => Promise<unknown>;

export function gatewayUrl(): string {
  return process.env.IBKR_GATEWAY_URL?.replace(/\/+$/, "") || IBKR_DEFAULT_GATEWAY;
}

/**
 * True for addresses that are unambiguously this machine.
 *
 * The gateway ships a self-signed certificate, so its TLS cannot be verified.
 * Skipping verification is only acceptable because the connection never leaves
 * the host — doing it for an arbitrary hostname would silently accept anyone
 * able to intercept the traffic.
 */
export function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/** Minimal GET that tolerates the gateway's self-signed certificate. */
/**
 * A caller for the gateway, exported so other features can ask it questions.
 *
 * The connector's own use is the account state, but the gateway also knows what
 * instruments are worth — and pricing a Trade Republic ETF through a gateway
 * you already run beats signing up to a quote vendor. Same transport, same
 * loopback restriction, no new trust placed anywhere.
 */
export const ibkrGet = (base: string, path: string, method: "GET" | "POST" = "GET") =>
  defaultGet(base)(path, method);

const defaultGet =
  (base: string): IbkrGet =>
  (path: string, method: "GET" | "POST" = "GET") =>
    new Promise((resolve, reject) => {
      const url = new URL(base + path);
      const isHttps = url.protocol === "https:";
      const send = isHttps ? httpsRequest : httpRequest;

      const req = send(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method,
          headers: {
            Accept: "application/json",
            // The gateway's Jetty returns 403 Access Denied to a request with
            // no User-Agent, which is why a browser works and a bare HTTP
            // client does not.
            "User-Agent": "money-os",
            // Only on POST: some servers reject a GET carrying a body length.
            ...(method === "POST" ? { "Content-Length": "0" } : {}),
          },
          // Only ever relaxed for a connection that stays on this machine.
          ...(isHttps && isLoopback(url.hostname) ? { rejectUnauthorized: false } : {}),
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            const status = res.statusCode ?? 500;
            if (status >= 400) {
              // 401 from the gateway means the browser session lapsed, which
              // happens routinely — saying so beats quoting a status code.
              reject(
                new Error(
                  status === 401
                    ? "The IBKR gateway is running but its session has expired. Open " +
                      "https://localhost:5000 in a browser, log in again, and sync. " +
                      "IBKR sessions lapse on their own; this is not a fault."
                    : `IBKR gateway returned ${status} for ${path}`
                )
              );
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error(`IBKR gateway returned something that isn't JSON for ${path}`));
            }
          });
        }
      );

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNREFUSED") {
          reject(
            new Error(
              `Nothing is listening at ${base}. Start the IBKR Client Portal Gateway and log into it, ` +
                "then sync again."
            )
          );
          return;
        }
        reject(err);
      });

      req.end();
    });

/**
 * Asks the gateway which accounts it can see.
 *
 * Used so the app doesn't have to ask for an account id at all. People
 * reasonably type the username they log into the gateway with, which is not
 * the account id and produces a rejection that looks like a bug.
 */
export async function discoverIbkrAccounts(
  get: IbkrGet = defaultGet(gatewayUrl())
): Promise<{ accountId: string; displayName: string; currency: string }[]> {
  const problem = authProblem(parseAuthStatus(await get("/iserver/auth/status", "POST")));
  if (problem) throw new Error(problem);
  return parseAccounts(await get("/portfolio/accounts"));
}

export function createIbkrConnector(get: IbkrGet = defaultGet(gatewayUrl())): Connector {
  return {
    platform: "ibkr",

    validateIdentifier(identifier: string) {
      if (!isValidAccountId(identifier)) {
        // Showing what arrived matters: an id that looks right but carries an
        // invisible character is otherwise impossible to diagnose.
        return {
          ok: false as const,
          reason:
            `"${identifier}" isn't an IBKR account id. The id looks like U1234567 ` +
            `(or DU1234567 for paper) and is not the username you log into the ` +
            `gateway with. Leave the field empty and it will be detected for you.`,
        };
      }
      return { ok: true as const };
    },

    async getAccountState(identifier: string): Promise<NormalizedAccountState> {
      const wanted = normalizeAccountId(identifier);

      // IBKR drops an idle session. /tickle is the documented way to keep it
      // alive, and calling it first also revives one that is merely dormant
      // rather than genuinely expired. A failure here is not fatal on its own —
      // the status check below decides.
      try {
        await get("/tickle", "POST");
      } catch {
        // Ignored deliberately: the real verdict comes from auth/status.
      }

      // A dead session is the common case, so say so plainly before anything
      // else produces a confusing empty portfolio.
      const problem = authProblem(parseAuthStatus(await get("/iserver/auth/status", "POST")));
      if (problem) throw new Error(problem);

      // IBKR requires this before any other /portfolio call; it is the handshake.
      const accounts = parseAccounts(await get("/portfolio/accounts"));
      const account = accounts.find((a) => a.accountId.toUpperCase() === wanted);

      if (!account) {
        const found = accounts.map((a) => a.accountId).join(", ") || "none";
        throw new Error(`This gateway has no account ${wanted}. It reports: ${found}`);
      }

      const ledger = parseLedger(await get(`/portfolio/${account.accountId}/ledger`));
      const positions = parsePositions(await get(`/portfolio/${account.accountId}/positions/0`));

      return {
        // netliquidationvalue already contains the market value and unrealised
        // P&L of the positions below, so they are never added on top.
        // IBKR reports the ledger's own currency; the account is kept in it.
        currency: ledger.baseCurrency ?? "USD",
        equity: ledger.equity,
        withdrawable: ledger.cash,
        totalMarginUsed: null,
        // What the gateway says closed trades have made, all-time. Read rather
        // than derived, same rule as everywhere else: a figure we computed
        // under our own cost-basis method would quietly disagree with the
        // broker's own and there would be no way to tell which was right.
        realizedPnl: ledger.realizedPnl,
        totalNotionalPosition: positions.reduce((s, p) => s + (p.positionValue ?? 0), 0),
        asOf: new Date(),
        positions,
        balances: ledger.balances,
        spotValue: 0,
        // The per-currency rows are a breakdown of the equity above, not extra
        // money — the same situation as a Bybit unified account.
        balancesAreSeparatePool: false,
      };
    },
  };
}
