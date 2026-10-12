/**
 * Filters that take several values, and combine.
 *
 * Within one field the values are alternatives (Crypto or ETF); across fields
 * they all apply (Crypto or ETF, and on Hyperliquid, and in "Long Term"). An
 * empty field filters nothing. That one rule is the whole of "filters of
 * filters", and it is the same on every screen that has them.
 */

/** The choice that means "has no value here": no playlist, no tag, no category. */
export const NONE = "(none)";

/**
 * Whether something passes one field's filter.
 *
 * `values` is what it carries on that field — one value, or several for things
 * like playlists and tags. Carrying none, it matches only when NONE is chosen.
 */
export function matchesAny(values: readonly string[] | string | null | undefined, selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  const own = values === null || values === undefined ? [] : typeof values === "string" ? (values === "" ? [] : [values]) : values;
  if (own.length === 0) return selected.includes(NONE);
  return own.some((v) => selected.includes(v));
}

/** The list with `value` added, or taken out when it was there. */
export function toggled(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** A field's choices in words: "Crypto or ETF". */
export function choiceText(values: readonly string[], label: (v: string) => string = (v) => v): string {
  return values.map((v) => (v === NONE ? "none" : label(v))).join(" or ");
}

/**
 * Only the values a field may hold, each once — what a saved filter or an
 * address is reduced to before it is applied, so a value renamed or removed
 * since is dropped rather than leaving a filter that matches nothing.
 */
export function cleanChoices(raw: unknown, allowed?: readonly string[]): string[] {
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === "" ? [] : [raw];
  const out: string[] = [];
  for (const v of list) {
    if (typeof v !== "string") continue;
    const value = v.trim();
    if (value === "" || value.length > 200 || out.includes(value)) continue;
    if (allowed && value !== NONE && !allowed.includes(value)) continue;
    out.push(value);
  }
  return out.slice(0, 50);
}
