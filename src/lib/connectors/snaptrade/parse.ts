/**
 * SnapTrade replies, read into the connector shapes. Pure — no network.
 *
 * SnapTrade is an aggregator: one login that reaches your accounts at many
 * brokers. With a *Personal* key the key is yours — you made the SnapTrade
 * account, you linked the brokers in SnapTrade's own dashboard, and this app
 * only reads what that account can see (docs.snaptrade.com, "Personal vs
 * Commercial"). Nobody else holds access on your behalf.
 */

import { createHmac } from "node:crypto";
import type { NormalizedBalance, NormalizedPosition } from "../types";

export const SNAPTRADE_BASE_URL = "https://api.snaptrade.com";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
/** SnapTrade sends some numbers as strings ("12.5") and some as numbers. */
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * JSON with every object's keys sorted, at every level, and no whitespace —
 * the canonical form SnapTrade signs ("Request Signatures" in their docs).
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Json)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Json)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * The `Signature` header: HMAC-SHA256 of {content, path, query}, keyed with the
 * consumer key, base64. `query` is the query string exactly as sent, without
 * the "?"; `content` is the JSON body, or null for a GET.
 */
export function signRequest(consumerKey: string, path: string, query: string, content: unknown = null): string {
  const message = canonicalJson({ content: content ?? null, path, query });
  // The official SDK keys the HMAC with encodeURI(consumerKey); for the key
  // alphabet SnapTrade issues the two are the same, and matching it costs nothing.
  return createHmac("sha256", encodeURI(consumerKey)).update(message).digest("base64");
}

/** The query string a signed request carries: the client id and a timestamp in seconds. */
export function authQuery(clientId: string, now: Date = new Date()): string {
  return new URLSearchParams({ clientId, timestamp: String(Math.floor(now.getTime() / 1000)) }).toString();
}

export interface SnapAccount {
  id: string;
  name: string;
  institution: string;
  /** What SnapTrade states the whole account is worth, in `currency`. */
  total: number | null;
  currency: string | null;
}

/**
 * The accounts the key can see. Paper (demo) accounts and closed ones are
 * left out: neither is money you have.
 */
export function parseAccounts(payload: unknown): SnapAccount[] {
  if (!Array.isArray(payload)) return [];
  const out: SnapAccount[] = [];
  for (const raw of payload) {
    const a = obj(raw);
    const id = text(a?.id);
    if (!a || !id) continue;
    if (a.is_paper === true) continue;
    const status = text(a.status);
    if (status === "closed" || status === "archived") continue;
    const total = obj(obj(a.balance)?.total);
    out.push({
      id,
      name: text(a.name) ?? text(a.number) ?? id,
      institution: text(a.institution_name) ?? "Broker",
      total: num(total?.amount),
      currency: text(total?.currency)?.toUpperCase() ?? null,
    });
  }
  return out;
}

/**
 * Positions from `/accounts/{id}/positions/all`.
 *
 * `cost_basis` is the average price paid per unit (SnapTrade's own
 * definition). A price in another currency than the account's cannot be
 * turned into the account's money here — connectors hold no exchange rates —
 * so such a position keeps its units and prices but no value or result, and
 * the account total (which SnapTrade states) still includes it.
 */
export function parsePositions(payload: unknown, accountCurrency: string): NormalizedPosition[] {
  const results = obj(payload)?.results;
  if (!Array.isArray(results)) return [];
  const out: NormalizedPosition[] = [];
  for (const raw of results) {
    const p = obj(raw);
    const instrument = obj(p?.instrument);
    const symbol = text(instrument?.symbol) ?? text(instrument?.raw_symbol);
    const units = num(p?.units);
    if (!p || !symbol || units === null || units === 0) continue;
    const price = num(p.price);
    const cost = num(p.cost_basis);
    const currency = (text(p.currency) ?? text(instrument?.currency) ?? accountCurrency).toUpperCase();
    const sameCurrency = currency === accountCurrency;
    const size = Math.abs(units);
    out.push({
      coin: symbol,
      side: units < 0 ? "short" : "long",
      size,
      entryPrice: cost,
      markPrice: price,
      positionValue: sameCurrency && price !== null ? size * price : null,
      unrealizedPnl: sameCurrency && price !== null && cost !== null ? (price - cost) * units : null,
      returnOnEquity: null,
      leverage: null,
      leverageType: null,
      liquidationPrice: null,
      marginUsed: null,
      cumFunding: null,
      assetClass: text(instrument?.kind),
      instrumentName: text(instrument?.description),
    });
  }
  return out;
}

/** Cash per currency from `/accounts/{id}/balances`. */
export function parseCash(payload: unknown): { currency: string; cash: number }[] {
  if (!Array.isArray(payload)) return [];
  const out: { currency: string; cash: number }[] = [];
  for (const raw of payload) {
    const b = obj(raw);
    const currency = text(obj(b?.currency)?.code) ?? text(b?.currency);
    const cash = num(b?.cash);
    if (currency && cash !== null && cash !== 0) out.push({ currency: currency.toUpperCase(), cash });
  }
  return out;
}

/** Cash rows as balances: a breakdown of the account total, never added on top of it. */
export function cashBalances(cash: { currency: string; cash: number }[], accountCurrency: string): NormalizedBalance[] {
  return cash.map((c) => ({
    coin: c.currency,
    total: c.cash,
    hold: 0,
    price: c.currency === accountCurrency ? 1 : null,
    usdValue: c.currency === accountCurrency ? c.cash : null,
    costBasis: c.currency === accountCurrency ? c.cash : null,
    countsInPortfolio: false,
  }));
}

/** What SnapTrade's error replies mean, in words someone can act on. */
export function explainSnapTradeError(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "SnapTrade refused the key. Check the Client ID and the Consumer Key from your SnapTrade Personal dashboard.";
  }
  if (status === 429) return "SnapTrade is rate-limiting requests. Try again in a minute.";
  const detail = body.trim().slice(0, 200);
  return `SnapTrade answered ${status}${detail ? `: ${detail}` : ""}`;
}
