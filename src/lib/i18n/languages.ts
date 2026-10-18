/**
 * The languages the app is written in.
 *
 * Every listed language covers the shared message catalog. Pages still being
 * migrated keep their English content and translation boundaries (F18).
 *
 * The choice lives in a cookie, so the server renders in it too, and English
 * is what anyone gets until they choose.
 *
 * Pure.
 */

export const LANGUAGES = [
  { code: "en", name: "English", locale: "en-GB" },
  { code: "pt", name: "Português", locale: "pt-PT" },
  { code: "es", name: "Español", locale: "es-ES" },
  { code: "fr", name: "Français", locale: "fr-FR" },
  { code: "de", name: "Deutsch", locale: "de-DE" },
  { code: "it", name: "Italiano", locale: "it-IT" },
  { code: "nl", name: "Nederlands", locale: "nl-NL" },
  { code: "pl", name: "Polski", locale: "pl-PL" },
  { code: "ru", name: "Русский", locale: "ru-RU" },
  { code: "tr", name: "Türkçe", locale: "tr-TR" },
  { code: "ar", name: "العربية", locale: "ar" },
  { code: "hi", name: "हिन्दी", locale: "hi-IN" },
  { code: "bn", name: "বাংলা", locale: "bn-BD" },
  { code: "zh-CN", name: "简体中文", locale: "zh-CN" },
  { code: "ja", name: "日本語", locale: "ja-JP" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: Language = "en";

/** Applied to translated regions, never to pages whose content is still English. */
export function directionOf(language: Language): "ltr" | "rtl" {
  return language === "ar" ? "rtl" : "ltr";
}

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
