import { NextResponse } from "next/server";
import manifest from "@/lib/pwa/manifest.json";
import { textForRequest } from "@/actions/pageLanguage";
import { currentLanguage } from "@/actions/language";
import { directionOf } from "@/lib/i18n/languages";

export const dynamic = "force-dynamic";
export async function GET() {
  const [t, language] = await Promise.all([textForRequest(), currentLanguage()]);
  return NextResponse.json({ ...manifest, lang: language, dir: directionOf(language), description: t(manifest.description),
    shortcuts: manifest.shortcuts.map(shortcut => ({ ...shortcut, name: t(shortcut.name),
      ...('short_name' in shortcut ? { short_name: t(shortcut.short_name!) } : {}), description: t(shortcut.description) })),
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
