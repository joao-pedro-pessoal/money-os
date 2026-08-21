/**
 * Filtering the library.
 *
 * Type and category are independent filters on purpose: one taxonomy across
 * four media is only worth having if you can ask "everything on Stoicism" and
 * "only the courses" separately, and then together.
 */

import type { ResourceType, Status, Level } from "./types";

export interface FilterableResource {
  id: string;
  type: ResourceType;
  title: string;
  creator: string;
  status: Status;
  level: Level;
  featured: boolean;
  categorySlugs: string[];
  subtagSlugs: string[];
}

export interface LibraryFilters {
  /** null means every type. */
  type: ResourceType | null;
  category: string | null;
  subtag: string | null;
  status: Status | null;
  level: Level | null;
  search: string;
}

export const NO_LIBRARY_FILTERS: LibraryFilters = {
  type: null,
  category: null,
  subtag: null,
  status: null,
  level: null,
  search: "",
};

export function filterResources<T extends FilterableResource>(
  items: T[],
  f: LibraryFilters
): T[] {
  const q = f.search.trim().toLowerCase();

  return items.filter((r) => {
    if (f.type && r.type !== f.type) return false;
    if (f.category && !r.categorySlugs.includes(f.category)) return false;
    if (f.subtag && !r.subtagSlugs.includes(f.subtag)) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.level && r.level !== f.level) return false;
    if (q && !`${r.title} ${r.creator}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** How many of each type match everything *except* the type filter. */
export function countsByType<T extends FilterableResource>(
  items: T[],
  f: LibraryFilters
): Record<ResourceType, number> {
  // Counting with the type filter applied would show 0 next to every tab you
  // aren't on, which is both useless and quietly discouraging.
  const rest = filterResources(items, { ...f, type: null });
  const counts: Record<ResourceType, number> = { BOOK: 0, VIDEO: 0, PODCAST: 0, COURSE: 0 };
  for (const r of rest) counts[r.type]++;
  return counts;
}
