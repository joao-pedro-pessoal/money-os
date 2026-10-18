import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Language } from "@/lib/i18n/languages";

/** Public font assets only; no financial data is cached. */
export async function reportFonts(language: Language) {
  const script: Partial<Record<Language, string>> = {
    ar: "NotoSansArabic-Regular.ttf", hi: "NotoSansDevanagari-Regular.ttf",
    bn: "NotoSansBengali-Regular.ttf", "zh-CN": "NotoSansCJKsc-Regular.otf", ja: "NotoSansCJKjp-Regular.otf",
  };
  const selected = script[language];
  const [regular, bold, fallback] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts", selected ?? "NotoSans-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts", selected ?? "NotoSans-Bold.ttf")),
    readFile(join(process.cwd(), "assets/fonts", "NotoSans-Regular.ttf")),
  ]);
  return { regular, bold: selected ? regular : bold, fallback };
}
