/**
 * An order the person chose by dragging, kept per list in their account.
 *
 * Only ids are stored. Reading never trusts them: an id that no longer exists is
 * skipped, and anything the saved order does not mention keeps its default place
 * after the ordered ones, so a new account or budget simply appears at the end.
 */
export const ORDER_LISTS = ["dashboard", "accounts", "budgets", "buckets", "subscriptions"] as const;
export type OrderList = (typeof ORDER_LISTS)[number];

export const MAX_ORDER_IDS = 500;
const MAX_ID_LENGTH = 200;

export function isOrderList(value: unknown): value is OrderList {
  return typeof value === "string" && (ORDER_LISTS as readonly string[]).includes(value);
}

export function orderKey(list: OrderList): string {
  return `order:${list}`;
}

/** A list of distinct, short, non-empty ids, or null when the input is anything else. */
export function cleanOrder(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > MAX_ORDER_IDS) return null;
  const seen = new Set<string>();
  for (const id of input) {
    if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH || seen.has(id)) return null;
    seen.add(id);
  }
  return [...seen];
}

/** The stored JSON, or no order at all when it is missing or unreadable. */
export function parseOrder(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    return cleanOrder(JSON.parse(value)) ?? [];
  } catch {
    return [];
  }
}

/** Saved ids first, in their saved order; everything else after, in its default order. */
export function applyOrder<T>(items: T[], saved: string[], idOf: (item: T) => string): T[] {
  if (saved.length === 0) return items;
  const rank = new Map(saved.map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, index, rank: rank.get(idOf(item)) }))
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.index - b.index)
    .map(({ item }) => item);
}
