/** Export only fixed UI copy. Never load credentials, actions or user records. */
import { mkdirSync, writeFileSync } from "node:fs";
import { en, pt } from "../src/lib/i18n/source";

const strings: Record<string, string> = {};
function walk(value: object, prefix = "") {
  for (const [key, text] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof text === "string") strings[path] = text;
    else if (text && typeof text === "object") walk(text, path);
  }
}
walk(en);
for (const key of Object.keys(pt.labels)) strings[`labels.${key}`] = key;
for (const key of Object.keys(pt.server)) strings[`server.${key}`] = key;
Object.assign(strings, {
  "nav.pagesFound": "Pages found: {count}",
  "auth.locked": en.auth.locked("{time}"),
  "quickEntry.amount": en.quickEntry.amount("{currency}"),
  "quickEntry.amountPlain": en.quickEntry.amount(null),
  "settings.sameAsBase": en.settings.sameAsBase("{currency}"),
  "settings.lastDone": en.settings.lastDone("{when}"),
});
mkdirSync(".local-checkpoints/i18n", { recursive: true });
writeFileSync(".local-checkpoints/i18n/source.json", JSON.stringify(strings, null, 2) + "\n");
console.log(`Exported ${Object.keys(strings).length} fixed UI messages.`);
