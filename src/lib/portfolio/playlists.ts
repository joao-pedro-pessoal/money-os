/**
 * A position, a trade or a watched instrument can be in several playlists at
 * once — a coin in both "Long Term" and "Crypto". Each playlist counts all of
 * it, so the playlists' totals can add up to more than the portfolio; screens
 * that add them say so.
 *
 * Stored as a list of playlist ids on the row itself (`playlist_ids`).
 */

/** How many playlists one thing may be in: a list, not a tag cloud. */
export const MAX_PLAYLISTS_PER_ITEM = 20;

/** The playlists a form ticked: each id once, blanks dropped, in the order sent. */
export function playlistIdsFrom(values: readonly unknown[]): string[] {
  const ids: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (id === "" || id.length > 64 || ids.includes(id)) continue;
    ids.push(id);
  }
  if (ids.length > MAX_PLAYLISTS_PER_ITEM) throw new Error(`One position can be in at most ${MAX_PLAYLISTS_PER_ITEM} playlists.`);
  return ids;
}

/** The ids that still name a playlist: one deleted since is quietly left out. */
export function knownPlaylistIds(ids: readonly string[], known: ReadonlySet<string>): string[] {
  return ids.filter((id) => known.has(id));
}

/** Names for those ids, in the order of `ids`, skipping any playlist no longer there. */
export function playlistNamesOf(ids: readonly string[] | null | undefined, nameById: ReadonlyMap<string, string>): string[] {
  return (ids ?? []).flatMap((id) => {
    const name = nameById.get(id);
    return name === undefined ? [] : [name];
  });
}

/** The same list for the eye: "Long Term, Crypto", or a dash for none. */
export function playlistsText(names: readonly string[]): string {
  return names.length === 0 ? "—" : names.join(", ");
}

/** Which groups something falls in when grouped by playlist: each of its own, or the one for none. */
export function playlistGroups<T extends string>(names: readonly string[], none: T): (string | T)[] {
  return names.length === 0 ? [none] : [...new Set(names)];
}
