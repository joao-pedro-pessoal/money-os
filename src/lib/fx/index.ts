/**
 * Currency conversion. Pure functions plus a fetcher with injectable HTTP,
 * so the maths is testable without network.
 *
 * Base currency is EUR (PRODUCT_VISION §13). Every total shown to the user is
 * in EUR; balances in other currencies are converted at the stored rate.
 */

export const BASE_CURRENCY = "EUR";

export interface RateMap {
  /** Units of the currency per 1 EUR. EUR itself is always 1. */
  [currency: string]: number;
}

/**
 * Converts an amount into the base currency.
 *
 * Rates are quoted per 1 EUR (the API's convention), so converting *into* EUR
 * divides. An unknown currency returns null rather than silently passing the
 * number through unconverted — a wrong total is worse than a missing one.
 */
export function toBase(amount: number, currency: string, rates: RateMap): number | null {
  if (currency === BASE_CURRENCY) return round2(amount);
  const rate = rates[currency];
  if (!rate || rate <= 0) return null;
  return round2(amount / rate);
}

/** Converts out of the base currency into `currency`. */
export function fromBase(amount: number, currency: string, rates: RateMap): number | null {
  if (currency === BASE_CURRENCY) return round2(amount);
  const rate = rates[currency];
  if (!rate || rate <= 0) return null;
  return round2(amount * rate);
}

/**
 * Sums balances of mixed currencies into the base currency.
 * Anything that can't be converted is reported separately instead of being
 * dropped or counted at 1:1.
 */
export function sumInBase(
  items: { amount: number; currency: string }[],
  rates: RateMap
): { total: number; unconverted: { amount: number; currency: string }[] } {
  let total = 0;
  const unconverted: { amount: number; currency: string }[] = [];

  for (const item of items) {
    const converted = toBase(item.amount, item.currency, rates);
    if (converted === null) unconverted.push(item);
    else total += converted;
  }

  return { total: round2(total), unconverted };
}

/** Shape of the free Frankfurter API response (no API key required). */
interface FrankfurterResponse {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

export function parseRates(raw: unknown): RateMap {
  const data = (raw ?? {}) as FrankfurterResponse;
  const rates: RateMap = { [BASE_CURRENCY]: 1 };

  for (const [currency, value] of Object.entries(data.rates ?? {})) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) rates[currency] = n;
  }

  return rates;
}

export type HttpGet = (url: string) => Promise<unknown>;

const defaultHttpGet: HttpGet = async (url) => {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
};

export const FX_URL = `https://api.frankfurter.app/latest?from=${BASE_CURRENCY}`;

/** Fetches current rates quoted per 1 EUR. */
export async function fetchRates(httpGet: HttpGet = defaultHttpGet): Promise<RateMap> {
  return parseRates(await httpGet(FX_URL));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
