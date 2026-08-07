/**
 * Pure parser for Hyperliquid's `clearinghouseState` response.
 *
 * Everything the API returns is a STRING (including numbers), so parsing is
 * deliberate and defensive: a missing or malformed field becomes null rather
 * than NaN, which would silently poison every downstream total.
 *
 * Shape reference: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals
 */

import type { NormalizedAccountState, NormalizedPosition } from "../types";

/** Parses Hyperliquid's stringified numbers. Returns null when unusable. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Same, but for values that must exist — falls back to 0. */
function numOrZero(value: unknown): number {
  return num(value) ?? 0;
}

interface RawPositionWrapper {
  position?: {
    coin?: string;
    szi?: string;
    entryPx?: string | null;
    positionValue?: string;
    unrealizedPnl?: string;
    returnOnEquity?: string;
    liquidationPx?: string | null;
    marginUsed?: string;
    maxLeverage?: number;
    leverage?: { type?: string; value?: number; rawUsd?: string };
    cumFunding?: { allTime?: string; sinceOpen?: string; sinceChange?: string };
  };
  type?: string;
}

interface RawClearinghouseState {
  assetPositions?: RawPositionWrapper[];
  marginSummary?: {
    accountValue?: string;
    totalMarginUsed?: string;
    totalNtlPos?: string;
    totalRawUsd?: string;
  };
  crossMarginSummary?: Record<string, string>;
  withdrawable?: string;
  time?: number;
}

/**
 * `szi` is the signed position size: negative means short. We split it into an
 * explicit side plus a positive magnitude so no downstream code has to
 * remember the sign convention.
 */
export function parsePosition(raw: RawPositionWrapper): NormalizedPosition | null {
  const p = raw?.position;
  if (!p || !p.coin) return null;

  const szi = num(p.szi);
  if (szi === null || szi === 0) return null; // flat -> not an open position

  // Mark price isn't returned directly; positionValue / size recovers it.
  const positionValue = num(p.positionValue);
  const size = Math.abs(szi);
  const markPrice = positionValue !== null && size !== 0 ? positionValue / size : null;

  return {
    coin: p.coin,
    side: szi > 0 ? "long" : "short",
    size,
    entryPrice: num(p.entryPx),
    markPrice,
    positionValue,
    unrealizedPnl: num(p.unrealizedPnl),
    returnOnEquity: num(p.returnOnEquity),
    leverage: p.leverage?.value ?? null,
    leverageType: p.leverage?.type ?? null,
    liquidationPrice: num(p.liquidationPx),
    marginUsed: num(p.marginUsed),
    cumFunding: num(p.cumFunding?.allTime),
  };
}

export function parseClearinghouseState(raw: unknown): NormalizedAccountState {
  const data = (raw ?? {}) as RawClearinghouseState;

  if (!data.marginSummary) {
    throw new Error("Unexpected Hyperliquid response: missing marginSummary");
  }

  const positions = (data.assetPositions ?? [])
    .map(parsePosition)
    .filter((p): p is NormalizedPosition => p !== null);

  return {
    equity: numOrZero(data.marginSummary.accountValue),
    withdrawable: num(data.withdrawable),
    totalMarginUsed: num(data.marginSummary.totalMarginUsed),
    totalNotionalPosition: num(data.marginSummary.totalNtlPos),
    asOf: typeof data.time === "number" ? new Date(data.time) : null,
    positions,
  };
}

/** Hyperliquid identifies accounts by a 42-char hex address. */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}
