import { INVESTMENTS_ENABLED, type ProductEdition } from "@/lib/release/edition";
import { DEFAULT_LANGUAGE, LANGUAGES, languageOf, type Language } from "./languages";

const baseEdition: ProductEdition = INVESTMENTS_ENABLED ? "full" : "money";

/** Public language policy belongs to the build, independently of account privileges. */
export function languagesForEdition(edition: ProductEdition = baseEdition) {
  return edition === "money" ? LANGUAGES.filter(({ code }) => code === "en" || code === "pt") : LANGUAGES;
}

export function languageForEdition(value: string | null | undefined, edition: ProductEdition = baseEdition): Language {
  const language = languageOf(value);
  return languagesForEdition(edition).some(({ code }) => code === language) ? language : DEFAULT_LANGUAGE;
}
