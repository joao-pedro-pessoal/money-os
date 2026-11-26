import { DEFAULT_BASE_CURRENCY } from "./index";

export class ManualRateError extends Error {
  constructor(public readonly reason: "currency" | "reference" | "value") {
    super(reason === "reference" ? `${DEFAULT_BASE_CURRENCY} is the reference and always equals 1.` : reason === "currency" ? "Enter a three-letter currency code." : "Enter a positive rate with at most ten digits before and after the decimal point.");
  }
}

/** Exact numeric(20,10) input; do not round a person's chosen rate through Number. */
export function manualRate(code: string, raw: string) {
  const quote = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(quote)) throw new ManualRateError("currency");
  if (quote === DEFAULT_BASE_CURRENCY) throw new ManualRateError("reference");
  const value = raw.trim().replace(",", ".");
  if (!/^\d{1,10}(?:\.\d{1,10})?$/.test(value) || !/[1-9]/.test(value)) throw new ManualRateError("value");
  const [whole, fraction] = value.split(".");
  const integer = whole.replace(/^0+(?=\d)/, "");
  const decimals = fraction?.replace(/0+$/, "");
  return { quote, rate: decimals ? `${integer}.${decimals}` : integer };
}

export type ManualRateResult = { saved: true } | { error: string; retryAfter?: number };
