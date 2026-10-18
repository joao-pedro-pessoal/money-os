/** Translate only explicitly marked application copy, never arbitrary records. */
export type TextCatalog = Record<string, string>;
export type TextValues = Record<string, string | number | null | undefined>;
export type TextTranslator = (source: string, values?: TextValues) => string;
export const sourceText: TextTranslator = (source, values = {}) => source.replace(/\{(\w+)\}/g, (token, key: string) => Object.hasOwn(values, key) ? String(values[key] ?? "") : token);

const patterns = new WeakMap<TextCatalog, { expression: RegExp; keys: string[]; translated: string }[]>();

function messagePatterns(catalog: TextCatalog) {
  let compiled = patterns.get(catalog);
  if (!compiled) {
    compiled = Object.entries(catalog).filter(([source]) => /\{\w+\}/.test(source) && source.replace(/\{\w+\}/g, "").trim().length >= 10).sort(([a], [b]) => b.replace(/\{\w+\}/g, "").length - a.replace(/\{\w+\}/g, "").length).map(([source, translated]) => {
      const keys: string[] = [];
      const parts = source.split(/(\{\w+\})/g).map(part => {
        if (/^\{\w+\}$/.test(part)) { keys.push(part.slice(1, -1)); return "([\\s\\S]*?)"; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      });
      return { expression: new RegExp(`^${parts.join("")}$`), keys, translated };
    });
    patterns.set(catalog, compiled);
  }
  return compiled;
}

export function translateText(catalog: TextCatalog, source: string, values: TextValues = {}): string {
  let translated = Object.hasOwn(catalog, source) ? catalog[source] : source;
  if (!Object.hasOwn(catalog, source)) {
    for (const pattern of messagePatterns(catalog)) {
      const match = pattern.expression.exec(source);
      if (!match) continue;
      translated = pattern.translated;
      values = Object.fromEntries(pattern.keys.map((key, i) => [key, match[i + 1]]));
      break;
    }
  }
  return translated.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.hasOwn(values, key) ? String(values[key] ?? "") : token);
}
