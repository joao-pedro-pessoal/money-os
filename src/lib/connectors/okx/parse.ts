/**
 * Pure parsing and signing for OKX's v5 API.
 *
 * Shapes: https://www.okx.com/docs-v5/en/
 *
 * **Success is the string `"0"`, and that string is truthy.** Every reply is
 * `{code, msg, data}` where `code` is text, not a number — so `if (!code)` is
 * false on success *and* false on failure, and `if (code)` is true on both.
 * The check has to be an explicit comparison, which is why `okxError` exists
 * rather than a truthiness test at each call site. Verified live: a good
 * request answers `code: "0"`, a bad one `code: "51000"`.
 *
 * The account endpoint states `eqUsd` per currency — the venue's own valuation
 * of each holding. That is used instead of pricing anything here: it is one
 * fewer call, and it is the number OKX itself shows you, so the two cannot
 * disagree.
 *
 * Pure — no fetch, no DB.
 */

import { createHmac } from "crypto";

/** Every number arrives as a string, and "" means "not applicable". */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * The error OKX reported, or null.
 *
 * `code` is a string and `"0"` means success. Compared explicitly for the
 * reason in this file's header: both a truthy and a falsy test on `"0"` give
 * the wrong answer, and the wrong answer here is an empty account.
 */
export function okxError(payload: unknown): string | null {
  const root = asRecord(payload);
  if (root === null) return "OKX returned something that was not an object.";

  const code = root.code;
  if (typeof code !== "string") return "OKX returned a reply with no status code.";
  if (code === "0") return null;

  const message = typeof root.msg === "string" && root.msg !== "" ? root.msg : "no message";
  return `${message} (code ${code})`;
}

export interface OkxBalance {
  currency: string;
  /** Units held. */
  total: number;
  /** Units not free to move: frozen in orders or held as margin. */
  hold: number;
  /** The venue's own valuation of the holding, in US dollars. */
  usdValue: number | null;
}

/**
 * Balances from `/api/v5/account/balance`.
 *
 * The reply is `data[0].details[]`, one entry per currency. `eq` is what is
 * held and `eqUsd` what OKX says it is worth — taken rather than recomputed,
 * so this app and the exchange's own screen cannot report different numbers
 * for the same holding.
 *
 * A currency with no `eqUsd` stays unpriced. Never zero: an unpriced holding
 * counted as nothing is a portfolio that quietly shrinks.
 */
export function parseAccountBalances(payload: unknown): OkxBalance[] {
  if (okxError(payload) !== null) return [];

  const root = asRecord(payload);
  const data = root === null ? null : root.data;
  if (!Array.isArray(data) || data.length === 0) return [];

  const account = asRecord(data[0]);
  const details = account === null ? null : account.details;
  if (!Array.isArray(details)) return [];

  const balances: OkxBalance[] = [];
  for (const entry of details) {
    const row = asRecord(entry);
    if (row === null || typeof row.ccy !== "string") continue;

    const total = num(row.eq) ?? num(row.cashBal);
    if (total === null || total === 0) continue;

    balances.push({
      currency: row.ccy.toUpperCase(),
      total,
      // Frozen in an order, plus anything committed as margin.
      hold: (num(row.frozenBal) ?? 0) + (num(row.ordFrozen) ?? 0),
      usdValue: num(row.eqUsd),
    });
  }

  return balances.sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * The account's total value in dollars, as OKX states it.
 *
 * `totalEq` covers everything including currencies this app might not have
 * priced, so it is the better reading of the account than a sum of the parts.
 * Null when absent — and null is not zero, which on a balance sheet is the
 * difference between "not measured" and "you have nothing".
 */
export function parseTotalEquity(payload: unknown): number | null {
  if (okxError(payload) !== null) return null;

  const root = asRecord(payload);
  const data = root === null ? null : root.data;
  if (!Array.isArray(data) || data.length === 0) return null;

  const account = asRecord(data[0]);
  return account === null ? null : num(account.totalEq);
}

/**
 * The timestamp format OKX signs over: ISO 8601 in UTC, milliseconds included.
 *
 * `toISOString` produces exactly this. Pinned in a function because a signature
 * over a differently formatted timestamp is rejected as an invalid signature,
 * which reads identically to a wrong key.
 */
export function okxTimestamp(at: Date = new Date()): string {
  return at.toISOString();
}

/**
 * Signs a request.
 *
 * base64(HMAC-SHA256(secret, timestamp + method + requestPath + body)), with
 * the method upper-case and the request path including its query string. The
 * body is the empty string on a GET — present in the signed material, not
 * omitted from it.
 */
export function signRequest(input: {
  timestamp: string;
  method: string;
  requestPath: string;
  body?: string;
  apiSecret: string;
}): string {
  const material = `${input.timestamp}${input.method.toUpperCase()}${input.requestPath}${input.body ?? ""}`;
  return createHmac("sha256", input.apiSecret).update(material).digest("base64");
}

/**
 * True for something shaped like an OKX API key.
 *
 * OKX issues a UUID. Checked loosely — an empty box and a pasted wallet address
 * are rejected, and the verdict is left to the venue, because a strict pattern
 * would start refusing valid keys the day the format changes.
 */
export function isValidApiKey(value: string): boolean {
  const key = value.trim();
  return key.length >= 20 && !key.startsWith("0x") && !/\s/.test(key);
}
