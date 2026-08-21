/**
 * Favourites: the one list in the library that is entirely the reader's.
 *
 * Three things could plausibly mean "this is important" and they are kept
 * apart on purpose:
 *
 *  - `editorialRank` — a claim the application makes, held by one resource.
 *  - `featured` — a shelf the application arranges.
 *  - `favourite` — yours, set by you, and never written by a seed or an import.
 *
 * Collapsing them would have been less code and a worse app: the point of an
 * editorial position is that you're free to disagree with it.
 *
 * Pure — no DB, no React.
 */

export interface Favouritable {
  favourite: boolean;
  favouritedAt: Date | null;
}

/**
 * What the row should become when the star is clicked.
 *
 * Un-starring clears the timestamp rather than keeping it. A date that says
 * when you last liked something you no longer like is a small lie, and it
 * would sort the list wrongly if you ever starred it again.
 */
export function toggleFavouriteState(
  current: Favouritable,
  now: Date = new Date()
): Favouritable {
  return current.favourite
    ? { favourite: false, favouritedAt: null }
    : { favourite: true, favouritedAt: now };
}

/**
 * Favourites, most recently starred first.
 *
 * A favourite with no timestamp — possible in a backup taken before the column
 * existed — sorts last rather than being dropped. Losing a row because of a
 * missing date would be the worst possible outcome of a restore.
 */
export function sortByFavourited<T extends Favouritable>(items: readonly T[]): T[] {
  return [...items]
    .filter((r) => r.favourite)
    .sort((a, b) => {
      const at = a.favouritedAt?.getTime() ?? null;
      const bt = b.favouritedAt?.getTime() ?? null;
      if (at === bt) return 0;
      if (at === null) return 1;
      if (bt === null) return -1;
      return bt - at;
    });
}

export function favouriteCount(items: readonly Favouritable[]): number {
  return items.filter((r) => r.favourite).length;
}

/** True when the star should be filled. */
export function isFavourite(item: Favouritable): boolean {
  return item.favourite;
}
