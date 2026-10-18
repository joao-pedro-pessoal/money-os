/**
 * Every word of the translated parts of the app, in each language.
 *
 * `en` is the source and the type: `pt` is checked against it, so a sentence
 * added in English and not in Portuguese fails the build instead of showing
 * up half-translated. What is not translated yet — most pages beyond the
 * menus, sign-in, quick entry and Settings — is still written in place, in
 * English; it moves here page by page.
 *
 * Text marked `**like this**` is drawn bold by `components/Rich.tsx`.
 *
 * Never translated, anywhere: what is yours (account, category and shop
 * names), amounts, and currency codes. Those come from your data, not from
 * here.
 *
 * Pure.
 */
import type { Language } from "./languages";
import { catalogs, interpolate } from "./catalogs";

import { en, pt, type Messages } from "./source";
export type { Messages } from "./source";

/** Build the same typed tree for every locale, including dynamic sentences.
 * Missing keys are errors, never an unnoticed English fallback in a region
 * declaring a different language. Tests compare all keys with the source.
 */
function fromCatalog(catalog: Record<string, string>): Messages {
  const read = (key: string) => {
    const value = catalog[key];
    if (typeof value !== "string") throw new Error(`Missing translation: ${key}`);
    return value;
  };
  function translate(tree: object, prefix = ""): object {
    return Object.fromEntries(Object.entries(tree).map(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [key, typeof value === "string" ? read(path) :
        typeof value === "object" ? translate(value, path) : value];
    }));
  }
  const result = translate(en) as Messages;
  for (const key of Object.keys(pt.labels)) result.labels[key] = read(`labels.${key}`);
  for (const key of Object.keys(pt.server)) result.server[key] = read(`server.${key}`);
  result.nav.pagesFound = (count) => interpolate(read("nav.pagesFound"), { count });
  result.auth.locked = (time) => interpolate(read("auth.locked"), { time });
  result.quickEntry.amount = (currency) => currency
    ? interpolate(read("quickEntry.amount"), { currency }) : read("quickEntry.amountPlain");
  result.settings.sameAsBase = (currency) => interpolate(read("settings.sameAsBase"), { currency });
  result.settings.lastDone = (when) => interpolate(read("settings.lastDone"), { when });
  return result;
}

const MESSAGES: Record<Language, Messages> = {
  en, pt,
  ...Object.fromEntries(Object.entries(catalogs).map(([language, catalog]) => [language, fromCatalog(catalog)])),
} as Record<Language, Messages>;

export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}

/** A page or tab name in the chosen language, or as written when it has no translation. */
export function labelIn(messages: Messages, label: string): string {
  return messages.labels[label] ?? label;
}

/** A message from the server in the chosen language, when it is one this file knows. */
export function serverMessageIn(messages: Messages, message: string): string {
  return messages.server[message] ?? message;
}
