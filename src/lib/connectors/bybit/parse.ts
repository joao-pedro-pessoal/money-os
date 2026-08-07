/**
 * Pure parsing and signing for Bybit's V5 API.
 *
 * Like Hyperliquid, every number arrives as a string, and several fields come
 * back as "" rather than null — an empty liquidation price means "no
 * liquidation applies", not zero, and treating it as zero would show a position
 * as about to be liquidated.
 *
 * Shapes: https://bybit-exchange.github.io/docs/v5/account/wallet-balance
 *         https://bybit-exchange.github.io/docs/v5/position
 */

import { createHmac } from "crypto";
import type { NormalizedBalance, NormalizedPosition } from "../types";

/** Bybit writes "" for "not applicable". Only a real number gets through. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Signs a V5 request.
 *
 * The signed string is timestamp + apiKey + recvWindow + queryString, in that
 * exact order and with no separators. Getting the order wrong is the usual
 * cause of a 401, so it is pinned by a test with a known-good vector.
 */
export function signRequest(
  timestamp: number,
  apiKey: string,
  recvWindow: number,
  queryString: string,
  apiSecret: string
): string {
  return createHmac("sha256", apiSecret)
    .update(`${timestamp}${apiKey}${recvWindow}${queryString}`)
    .digest("hex");
}

/** Query strings must be built in a stable order, since they are signed. */
export function buildQuery(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

interface BybitEnvelope<T> {
  retCode?: number;
  retMsg?: string;
  result?: T;
  time?: number;
}

/**
 * Bybit answers HTTP 200 even for failures, putting the real outcome in
 * retCode. Ignoring that would turn "invalid API key" into an empty portfolio
 * and silently wipe the account balance to zero.
 */
export function unwrap<T>(raw: unknown): T {
  const envelope = (raw ?? {}) as BybitEnvelope<T>;

  if (typeof envelope.retCode !== "number") {
    throw new Error("Unexpected Bybit response: no retCode");
  }
  if (envelope.retCode !== 0) {
    throw new Error(`Bybit error ${envelope.retCode}: ${envelope.retMsg ?? "unknown"}`);
  }
  if (envelope.result === undefined) {
    throw new Error("Bybit returned no result");
  }
  return envelope.result;
}

interface RawCoin {
  coin?: string;
  equity?: string;
  usdValue?: string;
  walletBalance?: string;
  locked?: string;
  unrealisedPnl?: string;
}

interface RawWalletAccount {
  accountType?: string;
  totalEquity?: string;
  totalWalletBalance?: string;
  totalMarginBalance?: string;
  totalAvailableBalance?: string;
  totalPerpUPL?: string;
  totalInitialMargin?: string;
  totalMaintenanceMargin?: string;
  coin?: RawCoin[];
}

export interface WalletState {
  totalEquity: number;
  availableBalance: number | null;
  totalInitialMargin: number | null;
  unrealisedPnl: number | null;
  balances: NormalizedBalance[];
  spotValue: number;
}

/**
 * Reads the unified account summary.
 *
 * `totalEquity` already includes the unrealised P&L of open positions, exactly
 * like Hyperliquid's accountValue — so the same accounting rule applies and
 * positions must never be added on top of it.
 *
 * Per-coin balances are reported for visibility, and their USD values are NOT
 * summed into a separate spot pool: on a unified account they are already
 * inside totalEquity. `spotValue` is therefore 0 by design.
 */
export function parseWalletBalance(raw: unknown): WalletState {
  const result = unwrap<{ list?: RawWalletAccount[] }>(raw);
  const account = (result.list ?? [])[0];

  if (!account) {
    throw new Error("Bybit returned no account in the wallet balance");
  }

  const balances: NormalizedBalance[] = [];
  for (const c of account.coin ?? []) {
    if (!c?.coin) continue;
    const total = num(c.walletBalance) ?? num(c.equity) ?? 0;
    if (total === 0) continue;

    const usdValue = num(c.usdValue);
    balances.push({
      coin: c.coin,
      total,
      hold: num(c.locked) ?? 0,
      price: usdValue !== null && total !== 0 ? round8(usdValue / total) : null,
      usdValue,
    });
  }

  return {
    totalEquity: num(account.totalEquity) ?? 0,
    availableBalance: num(account.totalAvailableBalance),
    totalInitialMargin: num(account.totalInitialMargin),
    unrealisedPnl: num(account.totalPerpUPL),
    balances,
    // Already inside totalEquity on a unified account — see the doc comment.
    spotValue: 0,
  };
}

interface RawPosition {
  symbol?: string;
  side?: string;
  size?: string;
  avgPrice?: string;
  markPrice?: string;
  positionValue?: string;
  unrealisedPnl?: string;
  leverage?: string;
  liqPrice?: string;
  positionIM?: string;
  cumRealisedPnl?: string;
  createdTime?: string;
  positionStatus?: string;
}

/**
 * Normalizes one position.
 *
 * Bybit says "Buy"/"Sell" where the rest of the app says long/short, and
 * returns an empty side with size 0 for a closed position, which must not
 * become a phantom holding.
 */
export function parsePosition(raw: RawPosition): NormalizedPosition | null {
  if (!raw?.symbol) return null;

  const size = num(raw.size);
  if (size === null || size === 0) return null;

  const side = raw.side === "Sell" ? "short" : raw.side === "Buy" ? "long" : null;
  if (side === null) return null; // empty side means no open position

  const positionValue = num(raw.positionValue);
  const entryPrice = num(raw.avgPrice);

  return {
    coin: raw.symbol,
    side,
    size: Math.abs(size),
    entryPrice,
    markPrice: num(raw.markPrice),
    positionValue,
    unrealizedPnl: num(raw.unrealisedPnl),
    // Bybit gives no direct return-on-equity; derive it from margin when we can.
    returnOnEquity: deriveRoe(num(raw.unrealisedPnl), num(raw.positionIM)),
    leverage: num(raw.leverage),
    // Cross vs isolated isn't in this payload; the account-level margin mode
    // would be needed, so it is left unset rather than guessed.
    leverageType: null,
    liquidationPrice: num(raw.liqPrice), // "" -> null, meaning none applies
    marginUsed: num(raw.positionIM),
    cumFunding: null, // Bybit reports funding separately, not on the position
  };
}

function deriveRoe(pnl: number | null, initialMargin: number | null): number | null {
  if (pnl === null || initialMargin === null || initialMargin === 0) return null;
  return round8(pnl / initialMargin);
}

export function parsePositions(raw: unknown): NormalizedPosition[] {
  const result = unwrap<{ list?: RawPosition[] }>(raw);
  return (result.list ?? [])
    .map(parsePosition)
    .filter((p): p is NormalizedPosition => p !== null);
}

/** Bybit keys are alphanumeric; this catches a pasted-wrong value early. */
export function isValidApiKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{8,64}$/.test(key.trim());
}

function round8(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e8) / 1e8;
}
