import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Language } from "@/lib/i18n/languages";

/** Public font files, read once per language and kept: no one's data is in them. */
const loaded = new Map<string, ReturnType<typeof readFonts>>();
export function reportFonts(language: Language) {
  const key = String(language);
  let fonts = loaded.get(key);
  if (!fonts) {
    fonts = readFonts(language);
    fonts.catch(() => loaded.delete(key));
    loaded.set(key, fonts);
  }
  return fonts;
}

async function readFonts(language: Language) {
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
