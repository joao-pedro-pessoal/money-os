/**
 * Pure parsing for Interactive Brokers' Client Portal Web API.
 *
 * IBKR is unlike the exchanges: you don't talk to IB at all. A Client Portal
 * Gateway runs on your own machine, you log in through a browser, and this
 * code makes REST calls to that local gateway. There is no API key, so nothing
 * secret is stored — but the session expires and has to be renewed by hand.
 *
 * Numbers arrive as real JSON numbers here, not strings as on the crypto
 * exchanges. What does bite is that IBKR omits fields rather than sending
 * nulls, and returns positions with a signed quantity.
 *
 * Shapes: https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/
 */

import type { NormalizedBalance, NormalizedPosition } from "../types";

/** Accepts real numbers and numeric strings; anything else becomes null. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---------------- Session ----------------

export interface AuthStatus {
  authenticated: boolean;
  connected: boolean;
  /** Another session is using the same username elsewhere. */
  competing: boolean;
}

/**
 * Reads /iserver/auth/status.
 *
 * Checked before anything else so an expired session produces "log in again"
 * rather than a confusing empty portfolio.
 */
export function parseAuthStatus(raw: unknown): AuthStatus {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    authenticated: d.authenticated === true,
    connected: d.connected === true,
    competing: d.competing === true,
  };
}

/** Turns a session state into something worth showing the user. */
export function authProblem(status: AuthStatus): string | null {
  if (status.competing) {
    return (
      "Another session is logged in with the same IBKR username — Trader Workstation, " +
      "the mobile app, or the web portal. IBKR allows only one at a time. Log out " +
      "of the other one and sync again."
    );
  }
  if (!status.authenticated) {
    return (
      "The IBKR gateway is running but not logged in. Open it in a browser " +
      "(https://localhost:5000 by default), sign in, and sync again. Sessions " +
      "expire, so this comes back periodically — it is how IBKR works, not a fault."
    );
  }
  if (!status.connected) {
    return "The gateway is logged in but not connected to IBKR's servers yet. Try again shortly.";
  }
  return null;
}

// ---------------- Accounts ----------------

interface RawAccount {
  id?: string;
  accountId?: string;
  currency?: string;
  displayName?: string;
  type?: string;
}

export interface IbkrAccount {
  accountId: string;
  currency: string;
  displayName: string;
}

/**
 * Reads /portfolio/accounts. IBKR requires this to be called before any other
 * /portfolio endpoint, so it doubles as the handshake.
 */
export function parseAccounts(raw: unknown): IbkrAccount[] {
  if (!Array.isArray(raw)) {
    throw new Error("Unexpected response from the IBKR gateway when listing accounts");
  }

  return raw
    .map((a: RawAccount) => {
      const accountId = a?.accountId ?? a?.id;
      if (!accountId) return null;
      return {
        accountId,
        currency: a.currency ?? "USD",
        displayName: a.displayName ?? accountId,
      };
    })
    .filter((a): a is IbkrAccount => a !== null);
}

// ---------------- Ledger (cash by currency) ----------------

interface RawLedgerEntry {
  currency?: string;
  cashbalance?: number;
  settledcash?: number;
  netliquidationvalue?: number;
  stockmarketvalue?: number;
  unrealizedpnl?: number;
  realizedpnl?: number;
  exchangerate?: number;
}

export interface LedgerState {
  /** Net liquidation value in the account's base currency. */
  equity: number;
  /** Cash available, base currency. */
  cash: number | null;
  unrealizedPnl: number | null;
  /** Per-currency cash balances, excluding the synthetic BASE row. */
  balances: NormalizedBalance[];
  baseCurrency: string | null;
}

/**
 * Reads /portfolio/{accountId}/ledger.
 *
 * The response is keyed by currency, plus a synthetic "BASE" entry holding the
 * same figures converted into the account's base currency. BASE is what we
 * want for equity — summing the per-currency rows would mix currencies.
 *
 * `netliquidationvalue` already includes the market value and unrealised P&L of
 * open positions, so positions are never added on top of it. Same rule as every
 * other platform (PRODUCT_VISION §9).
 */
export function parseLedger(raw: unknown): LedgerState {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Unexpected response from the IBKR gateway when reading the ledger");
  }

  const entries = raw as Record<string, RawLedgerEntry>;
  const base = entries.BASE;

  if (!base) {
    throw new Error("The IBKR ledger has no BASE entry, so the account total cannot be read");
  }

  const balances: NormalizedBalance[] = [];
  for (const [key, entry] of Object.entries(entries)) {
    // BASE is a converted view of the others, not money of its own.
    if (key === "BASE" || !entry) continue;

    const total = num(entry.cashbalance) ?? num(entry.settledcash) ?? 0;
    if (total === 0) continue;

    // exchangerate is the rate into the base currency, which is what the rest
    // of the app treats as the value.
    const rate = num(entry.exchangerate);
    balances.push({
      coin: entry.currency ?? key,
      total,
      hold: 0,
      price: rate,
      usdValue: rate === null ? null : round2(total * rate),
    });
  }

  return {
    equity: num(base.netliquidationvalue) ?? 0,
    cash: num(base.cashbalance) ?? num(base.settledcash),
    unrealizedPnl: num(base.unrealizedpnl),
    balances,
    baseCurrency: base.currency === "BASE" ? null : (base.currency ?? null),
  };
}

// ---------------- Positions ----------------

interface RawPosition {
  conid?: number;
  contractDesc?: string;
  ticker?: string;
  position?: number;
  mktPrice?: number;
  mktValue?: number;
  avgPrice?: number;
  avgCost?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  currency?: string;
  assetClass?: string;
}

/**
 * Reads one entry from /portfolio/{accountId}/positions/{page}.
 *
 * IBKR signs the quantity rather than naming a side: negative means short. A
 * closed position comes back with position 0 and must not become a phantom
 * holding.
 *
 * Note: IBKR reports each position in its own currency. The app's position
 * model has no currency field, and positions are excluded from Net Worth
 * anyway (they sit inside equity), so this only affects how the figure reads
 * on the positions page for a multi-currency account.
 */
export function parsePosition(raw: RawPosition): NormalizedPosition | null {
  const symbol = raw?.ticker ?? raw?.contractDesc;
  if (!symbol) return null;

  const size = num(raw.position);
  if (size === null || size === 0) return null;

  const mktValue = num(raw.mktValue);

  return {
    coin: symbol,
    // IBKR's own description. `STK` covers shares and ETFs alike, so this is
    // the only thing that can tell them apart — see lib/portfolio/nameEvidence.
    instrumentName: raw.contractDesc ?? null,
    side: size > 0 ? "long" : "short",
    size: Math.abs(size),
    // avgPrice is per unit; avgCost can include the multiplier on derivatives,
    // so it is only a fallback.
    entryPrice: num(raw.avgPrice) ?? num(raw.avgCost),
    markPrice: num(raw.mktPrice),
    positionValue: mktValue === null ? null : Math.abs(mktValue),
    unrealizedPnl: num(raw.unrealizedPnl),
    returnOnEquity: null,
    // Leverage is an account-level property at IBKR (margin), not a per-position
    // one, so claiming a number here would be inventing it.
    leverage: null,
    leverageType: null,
    liquidationPrice: null,
    marginUsed: null,
    cumFunding: null,
    // IBKR labels every position: STK, FUND, BOND, CASH, OPT, FUT… This is the
    // whole reason the app can fill in the asset type instead of asking.
    assetClass: typeof raw.assetClass === "string" ? raw.assetClass : null,
  };
}

export function parsePositions(raw: unknown): NormalizedPosition[] {
  if (!Array.isArray(raw)) {
    throw new Error("Unexpected response from the IBKR gateway when reading positions");
  }
  return raw
    .map(parsePosition)
    .filter((p): p is NormalizedPosition => p !== null);
}

/** IBKR account ids look like U1234567, or DU1234567 for a paper account. */
export function isValidAccountId(id: string): boolean {
  return /^[A-Z]{1,2}\d{6,10}$/.test(normalizeAccountId(id));
}

/**
 * Strips whatever a copy-paste dragged along.
 *
 * Copying an id out of a terminal or a web page routinely brings a trailing
 * space, a non-breaking space, or the surrounding quotes — none of which are
 * visible in an input box, which makes "that looks right to me" impossible to
 * debug.
 */
export function normalizeAccountId(id: string): string {
  return String(id ?? "")
    .replace(/[\s ​]/g, "")
    .replace(/^["']|["']$/g, "")
    .toUpperCase();
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
