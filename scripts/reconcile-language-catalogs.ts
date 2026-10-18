/** Reuse established wording wherever shared and page copy have the same source. */
import { readFileSync, writeFileSync } from "node:fs";
import { LANGUAGES } from "../src/lib/i18n/languages";
import { messagesFor } from "../src/lib/i18n/messages";
function strings(value: unknown, prefix = "", result: Record<string, string> = {}) {
  if (typeof value === "string") result[prefix] = value;
  else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) strings(child, `${prefix}.${key}`, result);
  return result;
}
const english = strings(messagesFor("en"));
for (const { code } of LANGUAGES) {
  const file = `src/lib/i18n/full/${code}.json`;
  const catalog = JSON.parse(readFileSync(file, "utf8"));
  const translated = strings(messagesFor(code));
  for (const [key, source] of Object.entries(english)) if (Object.hasOwn(catalog, source) && translated[key]) catalog[source] = translated[key];
  writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n");
}
