import { localeOf, type Language } from "./i18n/languages";

/** Display only. Currency belongs to the amount; the chosen language controls its notation. */
export function fmt(value: number, currency: string, language: Language = "en"): string {
  return new Intl.NumberFormat(localeOf(language), {
    style: "currency", currency,
    currencyDisplay: currency.toUpperCase() === "USD" ? "narrowSymbol" : "symbol",
  }).format(value);
}

export function formatNumber(value: number, language: Language = "en", options: Intl.NumberFormatOptions = {}): string {
  const text = new Intl.NumberFormat(localeOf(language), options).format(value);
  return language === "en" && options.notation === "compact" ? text.replace(/k$/, "K") : text;
}

/** An editable decimal, never a grouped display amount or an export format. */
export function decimalInput(value: number, language: Language = "en", digits = 2): string {
  return formatNumber(value, language, { useGrouping:false, numberingSystem:"latn", minimumFractionDigits:digits, maximumFractionDigits:digits })
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}

export function formatFor(language: Language) {
  return {
    locale: localeOf(language),
    fmt: (value: number, currency: string) => fmt(value, currency, language),
    number: (value: number, options: Intl.NumberFormatOptions = {}) => formatNumber(value, language, options),
    input: (value: number, digits = 2) => decimalInput(value, language, digits),
  };
}
