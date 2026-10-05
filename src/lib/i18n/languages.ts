/**
 * The languages the app is written in.
 *
 * Only the ones it is actually written in. The picker used to offer twelve,
 * and choosing any of them changed thirty words of the menu and nothing else —
 * on a phone, not even those, because the bottom bar never read the choice. A
 * language is listed here once its words exist in `messages.ts`.
 *
 * The choice lives in a cookie, so the server renders in it too, and English
 * is what anyone gets until they choose.
 *
 * Pure.
 */

export const LANGUAGES = [
  { code: "en", name: "English", locale: "en-GB" },
  { code: "pt", name: "Português", locale: "pt-PT" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: Language = "en";

/** Where the choice is kept, for the server and the browser alike. */
export const LANGUAGE_COOKIE = "moneyos_language";

/** A cookie's value as a language, or English for anything else. */
export function languageOf(value: string | null | undefined): Language {
  return LANGUAGES.some((l) => l.code === value) ? (value as Language) : DEFAULT_LANGUAGE;
}

/** Whether a value names a language the app is written in. */
export function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.some((l) => l.code === value);
}

/** How dates and times are written in a language. */
export function localeOf(language: Language): string {
  return LANGUAGES.find((l) => l.code === language)?.locale ?? "en-GB";
}
