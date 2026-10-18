/** Fixed legal copy and placeholders only; no environment or real identity. */
import { mkdirSync, writeFileSync } from "node:fs";
import { legalDocument, LEGAL_KINDS } from "../src/lib/legal/documents";
import { legalTemplate } from "../src/lib/legal/translation";

const source: Record<string, string> = {};
function walk(value: unknown) {
  if (typeof value === "string") {
    const template = legalTemplate(value);
    source[template] = template;
  } else if (value && typeof value === "object") Object.values(value).forEach(walk);
}
for (const name of [null, "{operatorName}"]) {
  for (const email of [null, "{operatorEmail}"]) {
    for (const kind of LEGAL_KINDS) walk(legalDocument(kind, "en", { name, email }));
  }
}
mkdirSync(".local-checkpoints/i18n", { recursive: true });
writeFileSync(".local-checkpoints/i18n/legal-source.json", JSON.stringify(source, null, 2) + "\n");
console.log(`Exported ${Object.keys(source).length} fixed legal messages.`);
