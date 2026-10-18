/** Request-scoped dictionaries. No account data or runtime translation service. */
import { cache } from "react";
import { currentLanguage } from "./language";
import { translateText, type TextCatalog, type TextValues } from "@/lib/i18n/text";
import type { Language } from "@/lib/i18n/languages";

const catalogs: Record<Language, () => Promise<{ default: TextCatalog }>> = {
  en: () => import("@/lib/i18n/full/en.json"), pt: () => import("@/lib/i18n/full/pt.json"),
  es: () => import("@/lib/i18n/full/es.json"), fr: () => import("@/lib/i18n/full/fr.json"),
  de: () => import("@/lib/i18n/full/de.json"), it: () => import("@/lib/i18n/full/it.json"),
  nl: () => import("@/lib/i18n/full/nl.json"), pl: () => import("@/lib/i18n/full/pl.json"),
  ru: () => import("@/lib/i18n/full/ru.json"), tr: () => import("@/lib/i18n/full/tr.json"),
  ar: () => import("@/lib/i18n/full/ar.json"), hi: () => import("@/lib/i18n/full/hi.json"),
  bn: () => import("@/lib/i18n/full/bn.json"), "zh-CN": () => import("@/lib/i18n/full/zh-CN.json"),
  ja: () => import("@/lib/i18n/full/ja.json"),
};

export const pageCatalog = cache(async () => (await catalogs[await currentLanguage()]()).default);
export async function textForRequest() {
  const catalog = await pageCatalog();
  return (source: string, values?: TextValues) => translateText(catalog, source, values);
}
