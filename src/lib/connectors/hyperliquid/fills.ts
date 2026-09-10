/**
 * Hyperliquid fills, as investment activity rows.
 *
 * The venue keeps every fill in `userFills`, and until now the app read only
 * the aggregate — a single realised-P&L number — and threw the detail away.
 * The detail is the part worth having: what was traded, when, which way, at
 * what price, what it cost in fees and what it closed for. That is a trade
 * history, and no other source in this app can produce one for a venue with no
 * statement to import.
 *
 * Pure: no database, no fetch. The action decides which account these belong to
 * and writes them.
 */

import type { InvestmentActivityInput } from "@/lib/investment-activity";

/** One fill, in the shape `userFills` returns. */
export interface RawFill {
  coin?: string;
  px?: string;
  sz?: string;
  side?: string;
  time?: number;
  dir?: string;
  closedPnl?: string;
  fee?: string;
  tid?: number;
  hash?: string;
}

export interface FillActivity extends InvestmentActivityInput {
  /** What the venue says this fill closed, when it closed something. */
  realizedPnl: number | null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * Which way the money went.
 *
 * Hyperliquid's `dir` is the readable one — "Open Long", "Close Short" — and
 * `side` is "B" or "A" for the book side. `dir` is preferred because a perp
 * that closes a short is a buy on the book and a sale of exposure, and the
 * history should say which of those happened.
 */
export function fillType(fill: RawFill): "BUY" | "SELL" {
  const dir = (fill.dir ?? "").toLowerCase();
  if (dir.includes("close") || dir.includes("sell") || dir.includes("short")) {
    // Closing anything, or opening a short, reduces or reverses exposure.
    if (dir.includes("open") && dir.includes("long")) return "BUY";
    return "SELL";
  }
  if (dir.includes("open") || dir.includes("buy") || dir.includes("long")) return "BUY";
  return fill.side === "A" ? "SELL" : "BUY";
}

/**
 * A fill's net cash movement.
 *
 * Buying costs money and selling returns it, so the sign follows the direction.
 * Fees are **not** folded in: `amount` is the trade, `fees` is the cost of
 * doing it, and the ledger subtracts fees separately. Netting them here would
 * have them counted twice — the exact trap `calculateInvestmentLedger`
 * documents when it says amount is authoritative.
 */
export function fillAmount(fill: RawFill): number | null {
  const px = num(fill.px);
  const sz = num(fill.sz);
  if (px === null || sz === null) return null;
  const gross = round(px * Math.abs(sz), 4);
  return fillType(fill) === "BUY" ? -gross : gross;
}

/**
 * Turns a venue fill into an activity row, or null when it cannot be read.
 *
 * A fill missing its price, size or timestamp is skipped rather than stored
 * with a zero in the gap: a trade recorded at a price of nothing would sit in
 * the history looking like a real event, and would feed every chart built on
 * top of it.
 */
export function fillToActivity(fill: RawFill, currency = "USD"): FillActivity | null {
  const px = num(fill.px);
  const sz = num(fill.sz);
  const time = num(fill.time);
  if (px === null || sz === null || time === null || !fill.coin) return null;

  const amount = fillAmount(fill);
  if (amount === null) return null;

  const closed = num(fill.closedPnl);

  return {
    date: new Date(time).toISOString(),
    type: fillType(fill),
    symbol: fill.coin,
    quantity: Math.abs(sz),
    price: px,
    amount,
    fees: num(fill.fee),
    currency,
    description: fill.dir ?? "",
    // The venue's own id, which is what makes re-syncing the same fill a no-op
    // instead of a duplicate row.
    externalId: fill.tid === undefined ? "" : String(fill.tid),
    /**
     * Zero here means the fill opened a position rather than closing one, so
     * there is nothing realised to record. Storing it as 0.00 would put a
     * break-even trade in the history that never happened.
     */
    realizedPnl: closed === null || closed === 0 ? null : round(closed, 4),
  };
}

/** Every readable fill, newest first. Unreadable ones are dropped, not guessed. */
export function fillsToActivity(raw: unknown, currency = "USD"): FillActivity[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawFill[])
    .map((f) => fillToActivity(f, currency))
    .filter((a): a is FillActivity => a !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}
