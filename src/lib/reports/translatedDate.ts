import { sourceText, type TextTranslator } from "@/lib/i18n/text";

/** Only for app-generated date labels, never names supplied by a person. */
export function translatedDate(label: string, translate: TextTranslator = sourceText): string {
  return label.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, month => translate(month));
}
