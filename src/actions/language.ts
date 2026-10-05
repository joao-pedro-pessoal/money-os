/**
 * The language a request asked for, for the parts of the app the server draws.
 *
 * Read from the cookie the language picker writes (`lib/i18n/languages.ts`),
 * so a page rendered on the server is in the same language as the menus the
 * browser draws. Not a server action: pages and layouts call it directly.
 */
import { cookies } from "next/headers";
import { LANGUAGE_COOKIE, languageOf, type Language } from "@/lib/i18n/languages";
import { messagesFor, type Messages } from "@/lib/i18n/messages";

export async function currentLanguage(): Promise<Language> {
  return languageOf((await cookies()).get(LANGUAGE_COOKIE)?.value);
}

/** Every word, in the language this request asked for. */
export async function words(): Promise<Messages> {
  return messagesFor(await currentLanguage());
}
