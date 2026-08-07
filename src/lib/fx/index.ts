/**
 * Currency conversion. Pure functions plus a fetcher with injectable HTTP,
 * so the maths is testable without network.
 *
 * Base currency is EUR (PRODUCT_VISION §13). Every total shown to the user is
 * in EUR; balances in other currencies are converted at the stored rate.
 */

/** Fallback when no preference is stored yet. */
export const DEFAULT_BASE_CURRENCY = "EUR";

/** Currencies the app can use as its base. */
export const SUPPORTED_CURRENCIES = [
  { code: "EUR", label: "Euro (€)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "BRL", label: "Brazilian Real (R$)" },
] as const;

export interface RateMap {
  /**
   * Units of the currency per 1 unit of the map's own reference currency.
   * The reference is whatever the rates were fetched against (EUR from the
   * provider); `base` in the conversion helpers is the currency the user
   * wants totals in, which may be different.
   */
  [currency: string]: number;
}

/**
 * Converts an amount into the base currency.
 *
 * Rates are quoted per 1 EUR (the API's convention), so converting *into* EUR
 * divides. An unknown currency returns null rather than silently passing the
 * number through unconverted — a wrong total is worse than a missing one.
 */
export function toBase(
  amount: number,
  currency: string,
  rates: RateMap,
  base: string = DEFAULT_BASE_CURRENCY
): number | null {
  if (currency === base) return round2(amount);

  const from = rates[currency];
  const to = rates[base];
  if (!from || from <= 0 || !to || to <= 0) return null;

  // Rates share a reference currency, so crossing them converts between any
  // two: amount / rate[from] gives the reference, x rate[base] gives the base.
  return round2((amount / from) * to);
}

/** Converts out of the base currency into `currency`. */
export function fromBase(
  amount: number,
  currency: string,
  rates: RateMap,
  base: string = DEFAULT_BASE_CURRENCY
): number | null {
  if (currency === base) return round2(amount);

  const to = rates[currency];
  const from = rates[base];
  if (!to || to <= 0 || !from || from <= 0) return null;

  return round2((amount / from) * to);
}

/**
 * Sums balances of mixed currencies into the base currency.
 * Anything that can't be converted is reported separately instead of being
 * dropped or counted at 1:1.
 */
export function sumInBase(
  items: { amount: number; currency: string }[],
  rates: RateMap,
  base: string = DEFAULT_BASE_CURRENCY
): { total: number; unconverted: { amount: number; currency: string }[] } {
  let total = 0;
  const unconverted: { amount: number; currency: string }[] = [];

  for (const item of items) {
    const converted = toBase(item.amount, item.currency, rates, base);
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
  // The provider quotes against EUR, so EUR is the map's reference at 1.
  const rates: RateMap = { [DEFAULT_BASE_CURRENCY]: 1 };

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

export const FX_URL = `https://api.frankfurter.app/latest?from=${DEFAULT_BASE_CURRENCY}`;

/** Fetches current rates quoted per 1 EUR. */
export async function fetchRates(httpGet: HttpGet = defaultHttpGet): Promise<RateMap> {
  return parseRates(await httpGet(FX_URL));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
