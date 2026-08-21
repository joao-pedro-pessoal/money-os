/**
 * Reading Trading 212's replies.
 *
 * Written against the published reference (docs.trading212.com, v0 beta):
 *
 *   GET /api/v0/equity/account/summary   →  cash, investments, totalValue
 *   GET /api/v0/equity/positions         →  quantity, prices, walletImpact
 *
 * Field access is still defensive, because the API is in beta and the shapes
 * may move. The rule throughout: a value that isn't there is `null`, never 0.
 * A balance that silently reads zero would wipe the account's value out of Net
 * Worth and look like a real change rather than a bug.
 *
 * Pure — no network, no DB.
 */

import type { NormalizedPosition, NormalizedDividend } from "../types";

type Obj = Record<string, unknown>;

export function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Walks a dotted path — `walletImpact.currentValue` — without throwing. */
export function dig(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const key of path.split(".")) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * The first path that carries a usable number.
 *
 * `null` means "not present", which callers must handle — never 0.
 */
export function pickNumber(source: unknown, paths: string[]): number | null {
  for (const path of paths) {
    const raw = dig(source, path);
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function pickString(source: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const raw = dig(source, path);
    if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  }
  return null;
}

/** An array, whether it arrived bare or wrapped in `items`/`data`. */
export function pickArray(source: unknown, keys: string[]): unknown[] {
  if (Array.isArray(source)) return source;
  if (!isObject(source)) return [];
  for (const key of keys) {
    const raw = source[key];
    if (Array.isArray(raw)) return raw;
  }
  return [];
}

export interface CashSummary {
  /** Everything: uninvested cash plus what the investments are worth. */
  total: number;
  /** Cash you could trade with right now. */
  free: number | null;
  /** Unrealised profit and loss across open positions. */
  unrealised: number | null;
  /** All-time realised profit and loss, as Trading 212 reports it. */
  realised: number | null;
  currency: string | null;
}

/**
 * The account summary.
 *
 * `totalValue` is the one number that must exist: the rest of the app treats it
 * as the account's equity. Trading 212 documents it as `totalValue`; older
 * payloads called the same idea `total`, so both are accepted and anything else
 * stops the sync with a message naming what did arrive.
 *
 * Free cash is `cash.availableToTrade` plus what's sitting uninvested inside
 * pies — both are yours and neither is in a position. Cash reserved for a
 * pending order is deliberately excluded: it isn't available, which is the
 * whole point of the field.
 */
export function parseAccountSummary(payload: unknown): CashSummary {
  const total = pickNumber(payload, ["totalValue", "total", "accountValue"]);
  if (total === null) {
    throw new Error(
      `Trading 212 returned an account summary without a total value. Fields seen: ${describeKeys(payload)}`
    );
  }

  const available = pickNumber(payload, ["cash.availableToTrade", "free", "cash.free"]);
  const inPies = pickNumber(payload, ["cash.inPies"]);

  return {
    total,
    free: available === null && inPies === null ? null : (available ?? 0) + (inPies ?? 0),
    unrealised: pickNumber(payload, [
      "investments.unrealizedProfitLoss",
      "investments.unrealisedProfitLoss",
      "ppl",
    ]),
    realised: pickNumber(payload, [
      "investments.realizedProfitLoss",
      "investments.realisedProfitLoss",
    ]),
    currency: pickString(payload, ["currency", "currencyCode"]),
  };
}

/**
 * Open positions.
 *
 * Trading 212's Invest accounts are long-only, so a negative quantity would
 * mean something has changed rather than that you're short; the sign is still
 * honoured rather than assumed away.
 *
 * `walletImpact` is reported in the *account's* currency while `currentPrice`
 * is in the *instrument's*. The value therefore comes from walletImpact where
 * it exists — multiplying quantity by price would mix two currencies for any
 * foreign holding and quietly overstate or understate it.
 */
export interface InstrumentInfo {
  /** One of Trading 212's own types: STOCK, ETF, CRYPTOCURRENCY, FOREX, … */
  type: string;
  name: string | null;
  isin: string | null;
}

/**
 * The instrument catalogue, keyed by ticker.
 *
 * This is the only honest way to tell an ETF from a share here. The ticker
 * doesn't help — `IGLAI_EQ` and an ordinary share both end in `_EQ` — and
 * guessing from the name ("does it contain iShares?") is right often and wrong
 * silently, which is the worst combination: an ETF filed as a stock quietly
 * skews the allocation you make decisions from.
 */
export function parseInstruments(payload: unknown): Map<string, InstrumentInfo> {
  const out = new Map<string, InstrumentInfo>();

  for (const row of pickArray(payload, ["items", "data"])) {
    if (!isObject(row)) continue;
    const ticker = pickString(row, ["ticker"]);
    const type = pickString(row, ["type"]);
    if (!ticker || !type) continue;

    out.set(ticker, {
      type,
      name: pickString(row, ["name", "shortName"]),
      isin: pickString(row, ["isin"]),
    });
  }

  return out;
}

export function parsePositions(
  payload: unknown,
  instruments: Map<string, InstrumentInfo> = new Map()
): NormalizedPosition[] {
  const rows = pickArray(payload, ["items", "positions", "data", "results"]);
  const out: NormalizedPosition[] = [];

  for (const row of rows) {
    if (!isObject(row)) continue;

    const ticker = pickString(row, ["instrument.ticker", "ticker", "instrument.name", "symbol"]);
    const quantity = pickNumber(row, ["quantity", "qty"]);
    if (ticker === null || quantity === null || quantity === 0) continue;

    const entry = pickNumber(row, ["averagePricePaid", "averagePrice", "avgPrice"]);
    const mark = pickNumber(row, ["currentPrice", "price"]);

    const size = Math.abs(quantity);
    // Account currency where available; otherwise fall back and accept that a
    // foreign holding is being valued in the instrument's own currency.
    const walletValue = pickNumber(row, ["walletImpact.currentValue"]);
    const value = walletValue ?? (mark === null ? null : size * mark);

    // The fx impact is already inside unrealizedProfitLoss (currentValue minus
    // totalCost), so adding it again would double-count the currency swing.
    const pnl = pickNumber(row, [
      "walletImpact.unrealizedProfitLoss",
      "walletImpact.unrealisedProfitLoss",
      "ppl",
    ]);

    out.push({
      coin: ticker,
      side: quantity < 0 ? "short" : "long",
      size,
      entryPrice: entry,
      markPrice: mark,
      positionValue: value,
      unrealizedPnl: pnl,
      returnOnEquity: null,
      leverage: null,
      leverageType: null,
      liquidationPrice: null,
      marginUsed: null,
      cumFunding: null,
      // Trading 212's own word for it — STOCK, ETF, CRYPTOCURRENCY — passed
      // through raw. Null when the catalogue hasn't been read yet, which the
      // classifier reports as "not known yet" rather than guessing.
      assetClass: instruments.get(ticker)?.type ?? null,
      instrumentName: instruments.get(ticker)?.name ?? pickString(row, ["instrument.name"]),
    });
  }

  return out;
}

/** The keys an unexpected payload actually had, for an error worth reading. */
export function describeKeys(payload: unknown): string {
  if (!isObject(payload)) return typeof payload;
  const keys = Object.keys(payload);
  return keys.length === 0 ? "none" : keys.join(", ");
}

/**
 * Turns an HTTP failure into something you can act on.
 *
 * These are the four the API documents, and they call for four different
 * responses: fix the credentials, fix the permissions, wait, or wait longer.
 */
export function explainHttpError(status: number, body: string): string {
  const trimmed = body.trim().slice(0, 200);
  switch (status) {
    case 401:
      return "Trading 212 rejected the credentials. The API key goes in one box and the API Secret in the other — if the secret was regenerated, the old one stops working immediately. Note the API only works for Invest and Stocks ISA accounts.";
    case 403:
      return "The credentials are valid but not allowed to read this. In Trading 212 → Settings → API (Beta), check the key's permissions, and that any IP restriction includes this machine's current address.";
    case 408:
      return "Trading 212 timed out. Try syncing again in a moment.";
    case 429:
      return "Trading 212 is rate-limiting the connection. The account summary allows one call every five seconds, per account — wait a few seconds and sync again.";
    case 500:
    case 502:
    case 503:
      return `Trading 212's API is having trouble (${status}). This is on their side; try again later.`;
    default:
      return `Trading 212 returned ${status}${trimmed ? `: ${trimmed}` : ""}`;
  }
}

/**
 * A cheap sanity check before saving the connection.
 *
 * Deliberately loose: the key format isn't documented, so this only catches an
 * empty box or an obvious paste of the wrong thing, rather than rejecting a
 * valid key for not matching a pattern I guessed at.
 */
export function isValidApiKey(value: string): boolean {
  const key = value.trim();
  if (key.length < 8) return false;
  if (/\s/.test(key)) return false;
  return true;
}

/**
 * The HTTP Basic header Trading 212 expects.
 *
 * Key as username, secret as password, base64 of "key:secret" after `Basic `.
 * Sending the key bare in `Authorization` is the older scheme and is what a
 * new key pair rejects with a 401 — which is exactly how this was got wrong
 * the first time.
 */
export function basicAuthHeader(apiKey: string, apiSecret: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`, "utf8").toString("base64")}`;
}

/**
 * Dividends, interest and other distributions actually paid out.
 *
 * `amount` is already in the account's currency, which is what the rest of the
 * app wants — `grossAmountPerShare` is in the instrument's, so the two must
 * never be multiplied together and compared.
 *
 * A row with no date or no amount is skipped rather than dated today: a
 * payment filed on the wrong day corrupts the cadence the app infers from it,
 * and a missing one is visibly missing.
 */
export function parseDividends(payload: unknown): NormalizedDividend[] {
  const out: NormalizedDividend[] = [];

  for (const row of pickArray(payload, ["items", "data"])) {
    if (!isObject(row)) continue;

    const ticker = pickString(row, ["ticker", "instrument.ticker"]);
    const paidOnRaw = pickString(row, ["paidOn", "paidOnDate", "date"]);
    const amount = pickNumber(row, ["amount", "amountInEuro"]);
    if (!ticker || !paidOnRaw || amount === null) continue;

    const paidOn = new Date(paidOnRaw);
    if (Number.isNaN(paidOn.getTime())) continue;

    out.push({
      ticker,
      instrumentName: pickString(row, ["instrument.name"]),
      isin: pickString(row, ["instrument.isin"]),
      paidOn,
      amount,
      currency: pickString(row, ["currency", "instrument.currency"]) ?? "EUR",
      quantity: pickNumber(row, ["quantity"]),
      grossPerShare: pickNumber(row, ["grossAmountPerShare"]),
      type: pickString(row, ["type"]),
      reference: pickString(row, ["reference"]),
    });
  }

  return out;
}

/** The next page's path, or null at the end of the history. */
export function nextPagePath(payload: unknown): string | null {
  const next = pickString(payload, ["nextPagePath"]);
  return next && next.startsWith("/") ? next : null;
}
