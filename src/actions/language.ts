/**
 * The language a request asked for, for the parts of the app the server draws.
 *
 * Read from the cookie the language picker writes (`lib/i18n/languages.ts`),
 * so a page rendered on the server is in the same language as the menus the
 * browser draws. Not a server action: pages and layouts call it directly.
 */
import { cookies } from "next/headers";
import { LANGUAGE_COOKIE, type Language } from "@/lib/i18n/languages";
import { languageForEdition } from "@/lib/i18n/editionLanguages";
import type { Messages } from "@/lib/i18n/messages";

export async function currentLanguage(): Promise<Language> {
  return languageForEdition((await cookies()).get(LANGUAGE_COOKIE)?.value);
}

/** Every word, in the language this request asked for. */
export async function words(): Promise<Messages> {
  // Reading a language cookie (e.g. a quota message) does not need to load
  // every translated catalog or their password-display dependencies.
  const { messagesFor } = await import("@/lib/i18n/messages");
  return messagesFor(await currentLanguage());
}
